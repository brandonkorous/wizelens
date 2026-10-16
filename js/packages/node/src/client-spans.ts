import {
  type Attributes,
  redactAttributes,
  type Span,
  type SpanCategory,
  type SpanEvent,
  type SpanKind as ContractKind,
  toAttributeValue,
} from "@wizeworks/lens-core";

const SPAN_KINDS: readonly ContractKind[] = ["server", "client", "internal", "producer", "consumer"];
const CATEGORIES: readonly SpanCategory[] = ["http.server", "http.client", "db", "browser", "internal"];
const HEX32 = /^[0-9a-f]{32}$/;
const HEX16 = /^[0-9a-f]{16}$/;
const MAX_EVENTS = 50;

function toAttributes(raw: unknown, redactKeys: readonly string[]): Attributes {
  const out: Attributes = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = toAttributeValue(v);
  }
  return redactAttributes(out, redactKeys);
}

function toEvents(raw: unknown, redactKeys: readonly string[]): SpanEvent[] {
  const events = Array.isArray(raw) ? raw : [];
  return events.slice(0, MAX_EVENTS).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const ev = e as Record<string, unknown>;
    return [{ name: String(ev.name ?? "event"), timeMs: Number(ev.timeMs) || 0, attributes: toAttributes(ev.attributes, redactKeys) }];
  });
}

/** Validate and redact one span posted by the browser. Returns null when it is not a valid span. */
export function sanitizeClientSpan(raw: unknown, redactKeys: readonly string[]): Span | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.traceId !== "string" || !HEX32.test(s.traceId)) return null;
  if (typeof s.spanId !== "string" || !HEX16.test(s.spanId)) return null;
  const parent = typeof s.parentSpanId === "string" && HEX16.test(s.parentSpanId) ? s.parentSpanId : null;
  return {
    traceId: s.traceId,
    spanId: s.spanId,
    parentSpanId: parent,
    name: typeof s.name === "string" ? s.name.slice(0, 500) : "browser",
    kind: SPAN_KINDS.includes(s.kind as ContractKind) ? (s.kind as ContractKind) : "client",
    category: CATEGORIES.includes(s.category as SpanCategory) ? (s.category as SpanCategory) : "browser",
    service: typeof s.service === "string" && s.service ? s.service.slice(0, 100) : "browser",
    startMs: Number(s.startMs) || 0,
    durationMs: Math.max(0, Number(s.durationMs) || 0),
    status: s.status === "error" || s.status === "ok" ? s.status : "unset",
    statusMessage: typeof s.statusMessage === "string" ? s.statusMessage : null,
    attributes: toAttributes(s.attributes, redactKeys),
    events: toEvents(s.events, redactKeys),
  };
}
