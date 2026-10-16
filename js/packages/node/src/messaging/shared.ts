import { type Attributes, type Context, context, createContextKey, ROOT_CONTEXT, type Span as OtelSpan, SpanKind, trace, type Tracer } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { ATTR_MESSAGING, type MessagingOperation } from "@wizeworks/lens-core";
import { isThenable } from "../db.js";
import { CATEGORY_ATTR } from "../processor.js";
import { recordOn, SERVER_SPAN } from "../spans.js";

export type MessagingSystem = "rabbitmq" | "kafka" | "servicebus";

export interface MessageFacts {
  system: MessagingSystem;
  destination: string;
  messageId?: string;
  batchSize?: number;
  bodySize?: number;
}

const w3c = new W3CTraceContextPropagator();
/** Set inside a producer span: a library calling its own send method again is part of it. */
const INSIDE_SEND = createContextKey("wizelens.messaging.inside-send");

function attributesOf(op: MessagingOperation, m: MessageFacts): Attributes {
  const a: Attributes = {
    [CATEGORY_ATTR]: "messaging",
    [ATTR_MESSAGING.system]: m.system,
    [ATTR_MESSAGING.operation]: op,
    [ATTR_MESSAGING.destination]: m.destination,
  };
  if (m.messageId !== undefined) a[ATTR_MESSAGING.messageId] = m.messageId;
  if (m.batchSize !== undefined) a[ATTR_MESSAGING.batchSize] = m.batchSize;
  if (m.bodySize !== undefined) a[ATTR_MESSAGING.bodySize] = m.bodySize;
  return a;
}

/** Start a send span inside the current request, or null when there is no request or a send is already open. */
export function startProducer(tracer: Tracer, m: MessageFacts): { span: OtelSpan; ctx: Context } | null {
  const active = context.active();
  if (!trace.getSpan(active) || active.getValue(INSIDE_SEND)) return null;
  const span = tracer.startSpan(`send ${m.destination}`, { kind: SpanKind.PRODUCER, attributes: attributesOf("send", m) });
  return { span, ctx: trace.setSpan(active, span).setValue(INSIDE_SEND, true) };
}

/** Write traceparent (and tracestate) into a message's header object. */
export function injectInto(ctx: Context, headers: Record<string, unknown>): void {
  w3c.inject(ctx, headers, { set: (carrier, key, value) => void (carrier[key] = value) });
}

/** Header values may be strings or Buffers (Kafka). */
const headerText = (v: unknown): string | undefined => (typeof v === "string" ? v : v instanceof Uint8Array ? Buffer.from(v).toString("utf8") : undefined);

/** Start a process span for one message, joined to the producer's trace when the headers carry it. */
export function startConsumer(tracer: Tracer, m: MessageFacts, headers: Record<string, unknown> | undefined): { span: OtelSpan; ctx: Context } {
  const getter = { get: (c: Record<string, unknown>, k: string) => headerText(c[k]), keys: (c: Record<string, unknown>) => Object.keys(c) };
  const parent = headers ? w3c.extract(ROOT_CONTEXT, headers, getter) : ROOT_CONTEXT;
  const span = tracer.startSpan(`process ${m.destination}`, { kind: SpanKind.CONSUMER, attributes: attributesOf("process", m) }, parent);
  return { span, ctx: trace.setSpan(parent, span).setValue(SERVER_SPAN, span) };
}

/** Run `fn` in the span's context and end the span when it settles (sync or promise). Returns what `fn` returns. */
export function runInSpan<T>(span: OtelSpan, ctx: Context, fn: () => T): T {
  const fail = (err: unknown) => {
    recordOn(span, err);
    span.end();
  };
  try {
    const out = context.with(ctx, fn);
    if (isThenable(out)) out.then(() => span.end(), fail);
    else span.end();
    return out;
  } catch (err) {
    fail(err);
    throw err;
  }
}

/** Byte length of a message body, when it is a string or bytes. */
export const sizeOf = (body: unknown): number | undefined =>
  typeof body === "string" ? Buffer.byteLength(body) : body instanceof Uint8Array ? body.byteLength : undefined;
