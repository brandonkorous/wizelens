import { type Span as OtelSpan, SpanStatusCode, type Tracer } from "@opentelemetry/api";
import { ATTR_MESSAGING } from "@wizeworks/lens-core";
import { captureOf, patchMethod } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { nowMs, OPERATION_NAME, recordReceive, runInSpan, sizeOf, startProducer, tap } from "./shared.js";
import { carrierOf, queueName, rememberQueue, type SqsAttributes, type SqsMessage, stampAttributes, TRACE_KEYS } from "./sqs-message.js";

interface Command {
  input?: unknown;
}
interface SendInput {
  QueueUrl?: string;
  MessageBody?: string;
  MessageAttributes?: SqsAttributes;
}
interface BatchInput {
  QueueUrl?: string;
  Entries?: SendInput[];
}
interface ReceiveInput {
  QueueUrl?: string;
  MessageAttributeNames?: string[];
}
type Call = (command: Command) => unknown;
type Callback = (err: unknown, out?: unknown) => void;
type Kind = "send" | "batch" | "receive";

const FAILED_COUNT = "messaging.aws_sqs.batch.failed_count";
const BY_NAME = new Map<string, Kind>([["SendMessageCommand", "send"], ["SendMessageBatchCommand", "batch"], ["ReceiveMessageCommand", "receive"]]);
/** Command classes taken from the module: matched by identity, so a bundler that renames classes cannot hide them. */
const byClass = new WeakMap<object, Kind>();

function kindOf(command: unknown): Kind | undefined {
  const ctor = (command as { constructor?: { name?: string } } | null)?.constructor;
  return ctor ? (byClass.get(ctor) ?? BY_NAME.get(String(ctor.name))) : undefined;
}

/** A copy of the command with a new input, so the caller's command and input stay as they were. */
const withInput = (command: Command, input: unknown): Command =>
  Object.assign(Object.create(Object.getPrototypeOf(command) as object) as Command, command, { input });

const destinationOf = (url: unknown) => queueName(url) ?? "unknown";

function traceSend(tracer: Tracer, command: Command, call: Call): unknown {
  const input = (command.input ?? {}) as SendInput;
  const facts = { system: "aws_sqs" as const, destination: destinationOf(input.QueueUrl), bodySize: sizeOf(input.MessageBody), extra: { [OPERATION_NAME]: "SendMessage" } };
  const open = startProducer(tracer, facts);
  if (!open) return call(command);
  const next = withInput(command, { ...input, MessageAttributes: stampAttributes(open.ctx, input.MessageAttributes) });
  const setId = (out: unknown) => {
    const id = (out as { MessageId?: unknown } | null)?.MessageId;
    if (typeof id === "string") open.span.setAttribute(ATTR_MESSAGING.messageId, id);
  };
  return runInSpan(open.span, open.ctx, () => tap(call(next), setId));
}

/** A batch that partly failed is an error: some of its messages never reached the queue. */
const markFailed = (span: OtelSpan, total: number) => (out: unknown) => {
  const failed = (out as { Failed?: unknown[] } | null)?.Failed?.length ?? 0;
  if (failed === 0) return;
  span.setAttribute(FAILED_COUNT, failed);
  span.setStatus({ code: SpanStatusCode.ERROR, message: `${failed} of ${total} messages failed` });
};

function traceBatch(tracer: Tracer, command: Command, call: Call): unknown {
  const input = (command.input ?? {}) as BatchInput;
  const entries = input.Entries ?? [];
  const facts = { system: "aws_sqs" as const, destination: destinationOf(input.QueueUrl), batchSize: entries.length, extra: { [OPERATION_NAME]: "SendMessageBatch" } };
  const open = startProducer(tracer, facts);
  if (!open) return call(command);
  const stamped = entries.map((e) => ({ ...e, MessageAttributes: stampAttributes(open.ctx, e.MessageAttributes) }));
  const next = withInput(command, { ...input, Entries: stamped });
  return runInSpan(open.span, open.ctx, () => tap(call(next), markFailed(open.span, entries.length)));
}

/** Ask SQS to return the trace attributes, unless the call already asks for all of them. */
function askForTrace(names: string[] | undefined): string[] {
  const list = names ?? [];
  if (list.some((n) => n === "All" || n === ".*")) return list;
  return [...list, ...TRACE_KEYS.filter((k) => !list.includes(k))];
}

/** One receive span per call that returned messages, joined to the producer when exactly one came back. */
function traceReceive(tracer: Tracer, command: Command, call: Call): unknown {
  const input = (command.input ?? {}) as ReceiveInput;
  const destination = destinationOf(input.QueueUrl);
  const started = nowMs();
  const record = (out: unknown) => {
    const messages = (out as { Messages?: SqsMessage[] } | null)?.Messages;
    if (!Array.isArray(messages) || messages.length === 0) return;
    rememberQueue(messages, destination);
    const one = messages.length === 1 ? messages[0] : undefined;
    const facts = { system: "aws_sqs" as const, destination, batchSize: messages.length, messageId: one?.MessageId, extra: { [OPERATION_NAME]: "ReceiveMessage" } };
    recordReceive(tracer, facts, carrierOf(one), started);
  };
  return tap(call(withInput(command, { ...input, MessageAttributeNames: askForTrace(input.MessageAttributeNames) })), record);
}

const TRACE: Record<Kind, (tracer: Tracer, command: Command, call: Call) => unknown> = { send: traceSend, batch: traceBatch, receive: traceReceive };

/** Trace `send(command)`; the callback form (`send(command, cb)`) runs on the promise form underneath. */
function patchSend(target: object, tracer: Tracer): void {
  patchMethod(target, "send", (original) =>
    function (this: unknown, command: unknown, ...rest: unknown[]) {
      const kind = kindOf(command);
      if (!kind) return original.call(this, command, ...rest);
      const callback = [rest[0], rest[1]].find((x) => typeof x === "function") as Callback | undefined;
      const args = callback ? [typeof rest[0] === "function" ? undefined : rest[0]] : rest;
      const out = TRACE[kind](tracer, command as Command, (c) => original.call(this, c, ...args));
      if (!callback) return out;
      void Promise.resolve(out).then((r) => callback(null, r), (e: unknown) => callback(e)).catch(() => undefined);
      return undefined;
    },
  );
}

/** Trace Amazon SQS through @aws-sdk/client-sqs v3. Pass the module or an SQSClient. Returns false when nothing was patched. */
export function instrumentSqs(wizelens: WizeLens, target: unknown): boolean {
  const t = target as Record<string, unknown> | null;
  if (!captureOf(wizelens) || !t || typeof t !== "object") return false;
  for (const [name, kind] of BY_NAME) {
    const commandClass = t[name];
    if (typeof commandClass === "function") byClass.set(commandClass, kind);
  }
  const Client = t.SQSClient as { prototype?: object } | undefined;
  if (Client?.prototype) return (patchSend(Client.prototype, wizelens.tracer), true);
  return typeof t.send === "function" ? (patchSend(t, wizelens.tracer), true) : false;
}
