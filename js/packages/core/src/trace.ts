import { adjustClockSkew, shiftLogs } from "./skew.js";
import type { LogRecord, Span, SpanStatus, Trace, TraceSummary } from "./types.js";

/** Pick the root span: no parent, else parent not in the set (earliest), else earliest. */
export function findRootSpan(spans: readonly Span[]): Span | undefined {
  if (spans.length === 0) return undefined;
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs);
  const noParent = sorted.find((s) => s.parentSpanId === null);
  if (noParent) return noParent;
  const ids = new Set(spans.map((s) => s.spanId));
  return sorted.find((s) => s.parentSpanId !== null && !ids.has(s.parentSpanId)) ?? sorted[0];
}

function attrString(span: Span | undefined, key: string): string | null {
  const v = span?.attributes[key];
  return v === undefined || v === null || v === "" ? null : String(v);
}

function attrNumber(span: Span | undefined, key: string): number | null {
  const v = span?.attributes[key];
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The request's entry server span: one that no other server call started. Safe with clock skew between services. */
export function entryServerSpan(spans: readonly Span[]): Span | undefined {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const servers = spans.filter((s) => s.category === "http.server").sort((a, b) => a.startMs - b.startMs);
  const isEntry = (s: Span) => {
    const parent = s.parentSpanId ? byId.get(s.parentSpanId) : undefined;
    return !parent || parent.category === "browser";
  };
  return servers.find(isEntry) ?? servers[0];
}

export function isErrorSpan(span: Span): boolean {
  return span.status === "error" || span.events.some((e) => e.name === "exception");
}

function timeBounds(spans: readonly Span[], logs: readonly LogRecord[]): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const s of spans) {
    start = Math.min(start, s.startMs);
    end = Math.max(end, s.startMs + s.durationMs);
  }
  if (spans.length === 0) {
    for (const l of logs) {
      start = Math.min(start, l.timeMs);
      end = Math.max(end, l.timeMs);
    }
  }
  return Number.isFinite(start) ? { start, end } : { start: 0, end: 0 };
}

function statusOf(spans: readonly Span[]): SpanStatus {
  if (spans.some((s) => s.status === "error")) return "error";
  return spans.some((s) => s.status === "ok") ? "ok" : "unset";
}

/** Build a full Trace from parts. Sorts spans and logs, computes summary fields. */
export function buildTrace(
  traceId: string,
  spans: readonly Span[],
  logs: readonly LogRecord[],
  remotes: Iterable<string>,
): Trace {
  const fixed = adjustClockSkew(spans);
  const sortedSpans = fixed.spans.sort((a, b) => a.startMs - b.startMs);
  const sortedLogs = shiftLogs(logs, fixed.offsets).sort((a, b) => a.timeMs - b.timeMs);
  const root = findRootSpan(sortedSpans);
  const { start, end } = timeBounds(sortedSpans, sortedLogs);
  const status = statusOf(sortedSpans);
  const services = new Set<string>();
  for (const s of sortedSpans) services.add(s.service);
  for (const l of sortedLogs) services.add(l.service);
  return {
    traceId,
    rootName: root?.name ?? "(no spans)",
    service: root?.service ?? sortedLogs[0]?.service ?? "unknown",
    startMs: start,
    durationMs: Math.max(0, end - start),
    status,
    spanCount: sortedSpans.length,
    dbCount: sortedSpans.filter((s) => s.category === "db").length,
    httpClientCount: sortedSpans.filter((s) => s.category === "http.client").length,
    errorCount: sortedSpans.filter(isErrorSpan).length,
    services: [...services].sort(),
    rootMethod: attrString(root, "http.request.method"),
    rootUrl: attrString(root, "url.path") ?? attrString(root, "url.full"),
    rootStatusCode: attrNumber(root, "http.response.status_code"),
    spans: sortedSpans,
    logs: sortedLogs,
    remotes: [...new Set(remotes)],
  };
}

export function toSummary(trace: Trace): TraceSummary {
  const { spans: _spans, logs: _logs, remotes: _remotes, ...summary } = trace;
  return summary;
}

function logKey(l: LogRecord): string {
  return `${l.timeMs}|${l.service}|${l.spanId ?? ""}|${l.level}|${l.message}`;
}

/** Merge parts of one trace from several services. Spans union by spanId, logs and remotes union. */
export function mergeTraces(traceId: string, parts: readonly Trace[]): Trace {
  const spans = new Map<string, Span>();
  const logs = new Map<string, LogRecord>();
  const remotes = new Set<string>();
  for (const p of parts) {
    for (const s of p.spans) if (!spans.has(s.spanId)) spans.set(s.spanId, s);
    for (const l of p.logs) logs.set(logKey(l), l);
    for (const r of p.remotes) remotes.add(r);
  }
  return buildTrace(traceId, [...spans.values()], [...logs.values()], remotes);
}
