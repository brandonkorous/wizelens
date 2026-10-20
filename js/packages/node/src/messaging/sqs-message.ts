import type { Attributes, Context } from "@opentelemetry/api";
import { captureOf } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { injectInto, OPERATION_NAME, runInSpan, sizeOf, startConsumer } from "./shared.js";

/** An SQS message attribute: PascalCase from the SDK, camelCase in a Lambda event record. */
interface SqsAttribute {
  DataType?: string;
  StringValue?: string;
  dataType?: string;
  stringValue?: string;
}
export type SqsAttributes = Record<string, SqsAttribute | undefined>;

/** A message from ReceiveMessage, or a record of a Lambda SQS event. */
export interface SqsMessage {
  MessageId?: string;
  Body?: string;
  Attributes?: Record<string, string | undefined>;
  MessageAttributes?: SqsAttributes;
  messageId?: string;
  body?: string;
  attributes?: Record<string, string | undefined>;
  messageAttributes?: SqsAttributes;
  eventSourceARN?: string;
}

export const TRACE_KEYS = ["traceparent", "tracestate"] as const;
/** SQS rejects a message with more than 10 message attributes. */
const MAX_ATTRIBUTES = 10;
const RECEIVE_COUNT = "messaging.aws_sqs.receive_count";
/** The queue each received message came from, so processSqsMessage can name it. */
const received = new WeakMap<object, string>();

/** Queue name from a queue URL, an ARN, or a plain name. */
export function queueName(ref: unknown): string | undefined {
  return typeof ref === "string" ? ref.split(/[/:]/).filter(Boolean).pop() : undefined;
}

/** Message attributes with the trace added, as far as the 10-attribute limit leaves room (traceparent first). */
export function stampAttributes(ctx: Context, attrs: SqsAttributes | undefined): SqsAttributes | undefined {
  const carrier: Record<string, unknown> = {};
  injectInto(ctx, carrier);
  const next: SqsAttributes = { ...attrs };
  let added = 0;
  for (const key of TRACE_KEYS) {
    const value = carrier[key];
    if (typeof value !== "string") continue;
    if (!(key in next) && Object.keys(next).length >= MAX_ATTRIBUTES) break;
    next[key] = { DataType: "String", StringValue: value };
    added++;
  }
  return added > 0 ? next : attrs;
}

/** The trace headers a message carries, or undefined. */
export function carrierOf(m: SqsMessage | undefined): Record<string, unknown> | undefined {
  const attrs = m?.MessageAttributes ?? m?.messageAttributes;
  if (!attrs) return undefined;
  const carrier: Record<string, unknown> = {};
  for (const key of TRACE_KEYS) {
    const value = attrs[key]?.StringValue ?? attrs[key]?.stringValue;
    if (typeof value === "string") carrier[key] = value;
  }
  return carrier;
}

/** Remember the queue of each received message. */
export function rememberQueue(messages: readonly SqsMessage[], queue: string): void {
  for (const m of messages) if (m && typeof m === "object") received.set(m, queue);
}

/** Process span facts for one message: queue, id, body size, and how often SQS has delivered it. */
function processFacts(m: SqsMessage, queue: string | undefined) {
  const extra: Attributes = { [OPERATION_NAME]: "process" };
  const count = Number((m.Attributes ?? m.attributes)?.ApproximateReceiveCount);
  if (Number.isFinite(count) && count > 0) extra[RECEIVE_COUNT] = count;
  const destination = queueName(queue) ?? received.get(m) ?? queueName(m.eventSourceARN) ?? "unknown";
  return { system: "aws_sqs" as const, destination, messageId: m.MessageId ?? m.messageId, bodySize: sizeOf(m.Body ?? m.body), extra };
}

/** Run `fn(message)` as the process span of an SQS message or Lambda SQS record, joined to its producer; `queue` names the queue. */
export function processSqsMessage<M, T>(wizelens: WizeLens, message: M, fn: (message: M) => T, queue?: string): T {
  if (!captureOf(wizelens) || !message || typeof message !== "object") return fn(message);
  const m = message as SqsMessage;
  const { span, ctx } = startConsumer(wizelens.tracer, processFacts(m, queue), carrierOf(m));
  return runInSpan(span, ctx, () => fn(message));
}
