import { context, type Tracer, trace } from "@opentelemetry/api";
import { captureOf, patchMethod } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { injectInto, nowMs, recordReceive, runInSpan, sizeOf, startConsumer, startProducer } from "./shared.js";

interface SbMessage {
  body?: unknown;
  messageId?: unknown;
  applicationProperties?: Record<string, unknown>;
}
interface SbBatch {
  count: number;
  tryAddMessage(message: SbMessage, options?: unknown): boolean;
}
interface Handlers {
  processMessage(message: SbMessage): Promise<void>;
}

const isBatch = (x: unknown): x is SbBatch => typeof (x as SbBatch | null)?.tryAddMessage === "function";

/** A copy of the message whose application properties carry the current trace. */
function stamped(message: SbMessage): SbMessage {
  const applicationProperties = { ...message.applicationProperties };
  injectInto(context.active(), applicationProperties);
  return { ...message, applicationProperties };
}

function patchSender(sender: object & { entityPath?: string }, tracer: Tracer): void {
  patchMethod(sender, "sendMessages", (original) =>
    function (this: unknown, messages: unknown, ...rest: unknown[]) {
      const list = isBatch(messages) ? null : Array.isArray(messages) ? (messages as SbMessage[]) : [messages as SbMessage];
      const batchSize = list ? list.length : (messages as SbBatch).count;
      const open = startProducer(tracer, { system: "servicebus", destination: sender.entityPath ?? "unknown", batchSize });
      const send = (payload: unknown) => original.call(this, payload, ...rest);
      if (!open) return send(messages);
      if (!list) return runInSpan(open.span, open.ctx, () => send(messages));
      const next = context.with(open.ctx, () => list.map(stamped));
      return runInSpan(open.span, open.ctx, () => send(Array.isArray(messages) ? next : next[0]));
    },
  );
  patchMethod(sender, "createMessageBatch", (original) =>
    function (this: unknown, ...args: unknown[]) {
      return Promise.resolve(original.apply(this, args)).then((batch) => {
        if (isBatch(batch)) patchMethod(batch, "tryAddMessage", (add) => function (this: unknown, m: unknown, ...r: unknown[]) {
          return trace.getSpan(context.active()) ? add.call(this, stamped(m as SbMessage), ...r) : add.call(this, m, ...r);
        });
        return batch;
      });
    },
  );
}

/** `receiveMessages` pulls a batch: one receive span, joined to the producer when exactly one message came back. */
function patchReceive(receiver: object & { entityPath?: string }, tracer: Tracer): void {
  patchMethod(receiver, "receiveMessages", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const started = nowMs();
      const out = original.apply(this, args);
      const record = (list: unknown) => {
        if (!Array.isArray(list) || list.length === 0) return;
        const one = list.length === 1 ? (list[0] as SbMessage) : undefined;
        const facts = { system: "servicebus" as const, destination: receiver.entityPath ?? "unknown", batchSize: list.length, messageId: one?.messageId === undefined ? undefined : String(one.messageId) };
        recordReceive(tracer, facts, one?.applicationProperties, started);
      };
      void Promise.resolve(out).then(record, () => undefined);
      return out;
    },
  );
}

function patchReceiver(receiver: object & { entityPath?: string }, tracer: Tracer): void {
  patchReceive(receiver, tracer);
  patchMethod(receiver, "subscribe", (original) =>
    function (this: unknown, handlers: unknown, ...rest: unknown[]) {
      const h = handlers as Handlers;
      const processMessage = (message: SbMessage) => {
        const facts = { system: "servicebus" as const, destination: receiver.entityPath ?? "unknown", messageId: message.messageId === undefined ? undefined : String(message.messageId), bodySize: sizeOf(message.body) };
        const { span, ctx } = startConsumer(tracer, facts, message.applicationProperties);
        return runInSpan(span, ctx, () => h.processMessage(message));
      };
      return original.call(this, { ...h, processMessage }, ...rest);
    },
  );
}

/** Patch the senders and receivers a client (or the ServiceBusClient class) creates. */
function patchClient(target: object, tracer: Tracer): void {
  for (const [name, patch] of [["createSender", patchSender], ["createReceiver", patchReceiver]] as const) {
    patchMethod(target, name, (original) =>
      function (this: unknown, ...args: unknown[]) {
        const made = original.apply(this, args);
        if (made && typeof made === "object") patch(made, tracer);
        return made;
      },
    );
  }
}

/** Trace Azure Service Bus through @azure/service-bus. Pass a ServiceBusClient, or the module. Returns false when nothing was patched. */
export function instrumentServiceBus(wizelens: WizeLens, target: unknown): boolean {
  const t = target as Record<string, unknown> | null;
  if (!captureOf(wizelens) || !t || typeof t !== "object") return false;
  const Client = t.ServiceBusClient as { prototype?: object } | undefined;
  if (Client?.prototype) return (patchClient(Client.prototype, wizelens.tracer), true);
  if (typeof t.createSender === "function" && typeof t.createReceiver === "function") return (patchClient(t, wizelens.tracer), true);
  return false;
}
