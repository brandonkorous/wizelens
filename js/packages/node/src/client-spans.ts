import {
  ATTR_BROWSER_REMOTE,
  type Attributes,
  type LogLevel,
  type LogRecord,
  redactAttributes,
  redactText,
  type Span,
  type SpanCategory,
  type SpanEvent,
  type SpanKind as ContractKind,
  toAttributeValue,
} from "@wizeworks/lens-core";

const SPAN_KINDS: readonly ContractKind[] = ["server", "client", "internal", "producer", "consumer"];
const CATEGORIES: readonly SpanCategory[] = ["http.server", "http.client", "db", "messaging", "browser", "internal"];
const HEX32 = /^[0-9a-f]{32}$/;
const HEX16 = /^[0-9a-f]{16}$/;
const MAX_EVENTS = 50;
const LEVELS: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error", "critical"];
const text = (v: unknown, fallback: string, max: number) => (typeof v === "string" && v ? v.slice(0, max) : fallback);

// A crawler's clock put its page view 4.6 hours before the server request. Within this gap the difference is network time.
const CLOCK_TOLERANCE_MS = 10_000;

/** How far (ms) to move a browser's times onto this server's clock: 0 when it sent no clock, or one close enough. */
export function browserClockOffset(sentAt: unknown, receivedAt: number): number {
  const sent = Number(sentAt);
  if (!Number.isFinite(sent) || sent <= 0) return 0;
  const offset = receivedAt - sent;
  return Math.abs(offset) > CLOCK_TOLERANCE_MS ? offset : 0;
}

const shifted = (ms: number, shiftMs: number) => (ms ? ms + shiftMs : ms);

function toAttributes(raw: unknown, redactKeys: readonly string[]): Attributes {
  const out: Attributes = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = toAttributeValue(v);
  }
  return redactAttributes(out, redactKeys);
}

function toEvents(raw: unknown, redactKeys: readonly string[], shiftMs: number): SpanEvent[] {
  const events = Array.isArray(raw) ? raw : [];
  return events.slice(0, MAX_EVENTS).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const ev = e as Record<string, unknown>;
    return [{ name: String(ev.name ?? "event"), timeMs: shifted(Number(ev.timeMs) || 0, shiftMs), attributes: toAttributes(ev.attributes, redactKeys) }];
  });
}

/** Validate and redact one span posted by the browser, moved by `shiftMs` (see browserClockOffset). Returns null when it is not a valid span. */
export function sanitizeClientSpan(raw: unknown, redactKeys: readonly string[], shiftMs = 0): Span | null {
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
    startMs: shifted(Number(s.startMs) || 0, shiftMs),
    durationMs: Math.max(0, Number(s.durationMs) || 0),
    status: s.status === "error" || s.status === "ok" ? s.status : "unset",
    statusMessage: typeof s.statusMessage === "string" ? redactText(s.statusMessage) : null,
    attributes: toAttributes(s.attributes, redactKeys),
    events: toEvents(s.events, redactKeys, shiftMs),
  };
}

/** Validate and redact one browser log line, moved by `shiftMs`. Returns null when it has no valid trace. */
export function sanitizeClientLog(raw: unknown, redactKeys: readonly string[], shiftMs = 0): { traceId: string; log: LogRecord } | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.traceId !== "string" || !HEX32.test(l.traceId)) return null;
  const log: LogRecord = {
    timeMs: shifted(Number(l.timeMs), shiftMs) || Date.now(),
    level: LEVELS.includes(l.level as LogLevel) ? (l.level as LogLevel) : "info",
    category: text(l.category, "console", 100),
    message: typeof l.message === "string" ? redactText(l.message.slice(0, 4000)) : "",
    service: text(l.service, "browser", 100),
    spanId: typeof l.spanId === "string" && HEX16.test(l.spanId) ? l.spanId : null,
    attributes: toAttributes(l.attributes, redactKeys),
  };
  return { traceId: l.traceId, log };
}

/** The server a browser span says answered it. Kept on the page's own origin or a trusted one, so a page cannot point the federation at any URL it likes. */
export function remoteOf(span: Span, origin: string | undefined, trusted: ReadonlySet<string> = new Set()): string | null {
  const remote = span.attributes[ATTR_BROWSER_REMOTE];
  if (typeof remote !== "string" || !origin) return null;
  try {
    const url = new URL(remote);
    return (url.origin === origin || trusted.has(url.origin)) && /^https?:$/.test(url.protocol) ? url.href.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

/** The origins of the `trustedRemotes` option, else of the comma-separated WIZELENS_TRUSTED_REMOTES variable. Bad entries are left out. */
export function trustedOrigins(list: readonly string[] | undefined, env = process.env.WIZELENS_TRUSTED_REMOTES): Set<string> {
  const origins = (list ?? env?.split(",") ?? []).map((e) => {
    try {
      return new URL(e.trim()).origin;
    } catch {
      return "null";
    }
  });
  return new Set(origins.filter((o) => o !== "null"));
}
