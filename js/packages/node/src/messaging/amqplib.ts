import type { Tracer } from "@opentelemetry/api";
import { captureOf, patchMethod } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { injectInto, runInSpan, sizeOf, startConsumer, startProducer } from "./shared.js";

interface AmqpMessage {
  content?: unknown;
  properties?: { headers?: Record<string, unknown>; messageId?: string };
}

type OnMessage = (msg: AmqpMessage | null) => unknown;

function patchPublish(proto: object, tracer: Tracer): void {
  patchMethod(proto, "publish", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const [exchange, routingKey, content, options] = args as [string, string, unknown, Record<string, unknown> | undefined];
      const destination = exchange || routingKey;
      const open = startProducer(tracer, { system: "rabbitmq", destination, bodySize: sizeOf(content), messageId: options?.messageId as string | undefined });
      if (!open) return original.apply(this, args);
      const headers = { ...(options?.headers as Record<string, unknown> | undefined) };
      injectInto(open.ctx, headers);
      const next = [exchange, routingKey, content, { ...options, headers }, ...args.slice(4)];
      return runInSpan(open.span, open.ctx, () => original.apply(this, next));
    },
  );
}

function patchConsume(proto: object, tracer: Tracer): void {
  patchMethod(proto, "consume", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const [queue, onMessage] = args as [string, OnMessage];
      if (typeof onMessage !== "function") return original.apply(this, args);
      const traced: OnMessage = (msg) => {
        if (!msg) return onMessage(msg);
        const facts = { system: "rabbitmq" as const, destination: queue, messageId: msg.properties?.messageId, bodySize: sizeOf(msg.content) };
        const { span, ctx } = startConsumer(tracer, facts, msg.properties?.headers);
        return runInSpan(span, ctx, () => onMessage(msg));
      };
      return original.apply(this, [queue, traced, ...args.slice(2)]);
    },
  );
}

const patchChannel = (channel: object, tracer: Tracer) => {
  const proto = Object.getPrototypeOf(channel) as object;
  patchPublish(proto, tracer);
  patchConsume(proto, tracer);
};

/** Patch channels as they are created from a connection. */
function patchConnection(connection: object, tracer: Tracer): void {
  const proto = Object.getPrototypeOf(connection) as object;
  for (const name of ["createChannel", "createConfirmChannel"]) {
    patchMethod(proto, name, (original) =>
      function (this: unknown, ...args: unknown[]) {
        const out = original.apply(this, args);
        void Promise.resolve(out).then((ch) => ch && typeof ch === "object" && patchChannel(ch, tracer), () => undefined);
        return out;
      },
    );
  }
}

/** Patch connections as `amqplib.connect` returns them. False when the module object cannot be changed. */
function patchModule(mod: Record<string, unknown>, tracer: Tracer): boolean {
  try {
    return patchMethod(mod, "connect", (original) =>
      function (this: unknown, ...args: unknown[]) {
        const out = original.apply(this, args);
        void Promise.resolve(out).then((conn) => conn && typeof conn === "object" && patchConnection(conn, tracer), () => undefined);
        return out;
      },
    );
  } catch {
    return false;
  }
}

/** Trace RabbitMQ through amqplib. Pass the module, a connection, or a channel. Returns false when nothing was patched. */
export function instrumentAmqplib(wizelens: WizeLens, target: unknown): boolean {
  const t = target as Record<string, unknown> | null;
  if (!captureOf(wizelens) || !t || typeof t !== "object") return false;
  const tracer = wizelens.tracer;
  if (typeof t.publish === "function" && typeof t.consume === "function") return (patchChannel(t, tracer), true);
  if (typeof t.createChannel === "function") return (patchConnection(t, tracer), true);
  return typeof t.connect === "function" ? patchModule(t, tracer) : false;
}

