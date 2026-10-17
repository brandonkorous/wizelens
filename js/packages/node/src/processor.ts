import { type Context, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { hrTimeToMilliseconds } from "@opentelemetry/core";
import type { ReadableSpan, Span as SdkSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  type Attributes,
  type Span,
  type SpanCategory,
  type SpanKind as ContractKind,
  isDbCall,
  redactAttributes,
  toAttributeValue,
} from "@wizeworks/lens-core";
import type { TraceStore } from "./store.js";

/** Set this attribute to force a contract category. Removed before storing. */
export const CATEGORY_ATTR = "wizelens.category";

const KINDS: Record<SpanKind, ContractKind> = {
  [SpanKind.INTERNAL]: "internal",
  [SpanKind.SERVER]: "server",
  [SpanKind.CLIENT]: "client",
  [SpanKind.PRODUCER]: "producer",
  [SpanKind.CONSUMER]: "consumer",
};

function toAttributes(attrs: Record<string, unknown>): Attributes {
  const out: Attributes = {};
  for (const [k, v] of Object.entries(attrs)) out[k] = toAttributeValue(v);
  return out;
}

function categoryOf(span: ReadableSpan, attrs: Attributes): SpanCategory {
  const forced = attrs[CATEGORY_ATTR];
  if (typeof forced === "string") return forced as SpanCategory;
  if (attrs["messaging.system"] != null) return "messaging";
  if (isDbCall(attrs)) return "db";
  if (span.kind === SpanKind.SERVER && attrs["rpc.system"] != null) return "http.server";
  if (span.kind === SpanKind.CLIENT && attrs["rpc.system"] != null) return "http.client";
  if (span.kind === SpanKind.SERVER && attrs["http.request.method"] != null) return "http.server";
  if (span.kind === SpanKind.CLIENT && attrs["http.request.method"] != null) return "http.client";
  return "internal";
}

function clientName(attrs: Attributes, fallback: string): string {
  const method = String(attrs["http.request.method"] ?? fallback);
  const full = attrs["url.full"];
  if (typeof full === "string") {
    try {
      const u = new URL(full);
      return `${method} ${u.host}${u.pathname}`;
    } catch {
      // keep fallback
    }
  }
  return fallback;
}

/** Map a finished OTel span to a contract Span. */
export function toContractSpan(span: ReadableSpan, service: string, redactKeys: readonly string[]): Span {
  const ctx = span.spanContext();
  const raw = toAttributes(span.attributes);
  const category = categoryOf(span, raw);
  delete raw[CATEGORY_ATTR];
  const attributes = redactAttributes(raw, redactKeys);
  const status = span.status.code === SpanStatusCode.ERROR ? "error" : span.status.code === SpanStatusCode.OK ? "ok" : "unset";
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: span.parentSpanContext?.spanId ?? null,
    name: category === "http.client" ? clientName(attributes, span.name) : span.name,
    kind: KINDS[span.kind] ?? "internal",
    category,
    service,
    startMs: hrTimeToMilliseconds(span.startTime),
    durationMs: hrTimeToMilliseconds(span.duration),
    status,
    statusMessage: span.status.message ?? null,
    attributes,
    events: span.events.map((e) => ({
      name: e.name,
      timeMs: hrTimeToMilliseconds(e.time),
      attributes: redactAttributes(toAttributes(e.attributes ?? {}), redactKeys),
    })),
  };
}

/** SpanProcessor that writes every finished span into the in-memory store. */
export class StoreSpanProcessor implements SpanProcessor {
  constructor(
    private readonly store: TraceStore,
    private readonly service: string,
    private readonly redactKeys: readonly string[],
  ) {}

  onStart(_span: SdkSpan, _parentContext: Context): void {}

  onEnd(span: ReadableSpan): void {
    // A local root has no parent, or a parent in another process.
    const parent = span.parentSpanContext;
    this.store.addSpan(toContractSpan(span, this.service, this.redactKeys), !parent || !!parent.isRemote);
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
