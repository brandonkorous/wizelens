import { adjustClockSkew, shiftLogs } from "./skew.js";
import { ATTR_EXPECTED } from "./attributes.js";
import { HEADER_EXPECTED, type LogRecord, type Span, type SpanStatus, type Trace, type TraceSummary } from "./types.js";

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

/** A 4xx answer: the caller asked for something missing or wrong. It is not a failure, even when the app marks the span as an error. */
export function isClientErrorStatus(span: Span): boolean {
  const code = attrNumber(span, "http.response.status_code");
  return code !== null && code >= 400 && code < 500;
}

const isOn = (v: unknown): boolean => {
  const first = Array.isArray(v) ? v[0] : v;
  if (first === true || first === 1) return true;
  if (typeof first !== "string") return false;
  const t = first.trim().toLowerCase();
  return t !== "" && t !== "0" && t !== "false" && t !== "no";
};

/** The response header as the server span records it (`http.response.header.x-wizelens-expected`). */
export const ATTR_EXPECTED_HEADER = `http.response.header.${HEADER_EXPECTED.toLowerCase()}`;

/** The app expected this answer (`wizelens.expected`, or the `X-WizeLens-Expected` header): a deliberate 503 is then not a failure, and keeps its status. */
export const isExpectedSpan = (span: Span): boolean => isOn(span.attributes[ATTR_EXPECTED]) || isOn(span.attributes[ATTR_EXPECTED_HEADER]);

/** The span's status is error, it did not answer 4xx, and the app did not expect the answer. */
export const isErrorStatus = (span: Span): boolean => span.status === "error" && !isClientErrorStatus(span) && !isExpectedSpan(span);

const hasException = (span: Span): boolean => span.events.some((e) => e.name === "exception");

/** An error status or an exception. A 4xx answer never is; an expected answer is only when something threw. */
export function isErrorSpan(span: Span): boolean {
  if (isClientErrorStatus(span)) return false;
  return isErrorStatus(span) || hasException(span);
}

/** A span that failed: an error, or an answer of 500 or more that the app did not expect. */
export function isFailedAnswer(span: Span): boolean {
  if (isErrorSpan(span)) return true;
  return Number(span.attributes["http.response.status_code"] ?? 0) >= 500 && !isExpectedSpan(span);
}

const STATUS_5XX = /^5\d\d$/;

/** A same-service span under an expected entry answer that only repeats its 5xx (Next's `BaseServer.handleRequest`). */
function echoesExpected(s: Span, entry: Span): boolean {
  if (s === entry || s.service !== entry.service || hasException(s)) return false;
  return STATUS_5XX.test(String(s.attributes["http.response.status_code"] ?? s.attributes["error.type"] ?? ""));
}

/** The error spans of a trace. When its entry server span was expected, spans that only echo that 5xx are not errors. */
export function errorSpansOf(spans: readonly Span[]): Span[] {
  const failed = spans.filter(isErrorSpan);
  const entry = failed.length ? entryServerSpan(spans) : undefined;
  if (!entry || !isExpectedSpan(entry)) return failed;
  return failed.filter((s) => !echoesExpected(s, entry));
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

/** A browser span this long after its server answered is from a cached page (a crawler, a restored tab), not this request. */
export const LATE_BROWSER_MS = 10 * 60_000;

/** The spans without browser spans that started more than LATE_BROWSER_MS after the entry server span ended. */
export function dropLateBrowserSpans(spans: readonly Span[]): readonly Span[] {
  const entry = entryServerSpan(spans);
  if (!entry) return spans;
  const last = entry.startMs + entry.durationMs + LATE_BROWSER_MS;
  return spans.some((s) => s.category === "browser" && s.startMs > last) ? spans.filter((s) => s.category !== "browser" || s.startMs <= last) : spans;
}

function statusOf(spans: readonly Span[]): SpanStatus {
  if (errorSpansOf(spans).some(isErrorStatus)) return "error";
  return spans.some((s) => s.status === "ok") ? "ok" : "unset";
}

/** Build a full Trace from parts. Sorts spans and logs, computes summary fields. */
/** The first span of each span id: a crawler's renderer can send the same span twice in one trace. */
export function uniqueSpans(spans: readonly Span[]): Span[] {
  const seen = new Set<string>();
  return spans.filter((s) => !seen.has(s.spanId) && !!seen.add(s.spanId));
}

export function buildTrace(
  traceId: string,
  spans: readonly Span[],
  logs: readonly LogRecord[],
  remotes: Iterable<string>,
): Trace {
  const fixed = adjustClockSkew(dropLateBrowserSpans(uniqueSpans(spans)));
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
    errorCount: errorSpansOf(sortedSpans).length,
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

/** Identity of one log line, used to merge parts without duplicates. */
export function logKey(l: LogRecord): string {
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
