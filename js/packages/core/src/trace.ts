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

export function isErrorSpan(span: Span): boolean {
  return span.status === "error" || span.events.some((e) => e.name === "exception");
}

/** Build a full Trace from parts. Sorts spans and logs, computes summary fields. */
export function buildTrace(
  traceId: string,
  spans: readonly Span[],
  logs: readonly LogRecord[],
  remotes: Iterable<string>,
): Trace {
  const sortedSpans = [...spans].sort((a, b) => a.startMs - b.startMs);
  const sortedLogs = [...logs].sort((a, b) => a.timeMs - b.timeMs);
  const root = findRootSpan(sortedSpans);
  let start = Infinity;
  let end = -Infinity;
  for (const s of sortedSpans) {
    start = Math.min(start, s.startMs);
    end = Math.max(end, s.startMs + s.durationMs);
  }
  if (sortedSpans.length === 0) {
    for (const l of sortedLogs) {
      start = Math.min(start, l.timeMs);
      end = Math.max(end, l.timeMs);
    }
  }
  if (!Number.isFinite(start)) {
    start = 0;
    end = 0;
  }
  const status: SpanStatus = sortedSpans.some((s) => s.status === "error")
    ? "error"
    : sortedSpans.some((s) => s.status === "ok")
      ? "ok"
      : "unset";
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
