import type { Span, Trace } from "./types.js";
import { findSlowQueries, hasUnknownParams, queryText, repeatableQueries, valuesOf } from "./db-findings.js";
import { findSlowPages } from "./page-findings.js";
import { errorSpansOf } from "./trace.js";
import { findSecurity, type TraceSecurityKind } from "./security/index.js";

export { dbSpans, findSlowQueries, hasUnknownParams, isSessionStatement, queryText, WAIT_MIN_QUERIES, WAIT_SHAPE } from "./db-findings.js";

/** Kinds that cost time: the Insights page lists them. */
export type InsightFindingKind = "duplicate-query" | "n+1-db" | "n+1-http" | "slow-query" | "db-wait";

export type FindingKind = InsightFindingKind | "error" | "slow-page" | TraceSecurityKind;

export interface Finding {
  kind: FindingKind;
  severity: "info" | "warning" | "error";
  title: string;
  /** SQL text, HTTP shape, or span name the finding is about. */
  shape: string;
  count: number;
  totalMs: number;
  spanIds: string[];
}

export interface AnalysisOptions {
  /** Minimum repeats for N+1 (db and http). Default 5. */
  nPlusOneThreshold?: number;
  /** Slow query threshold in ms. Default 100. */
  slowQueryMs?: number;
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUM_RE = /^\d+$/;

/** Path with numeric / guid segments and query values replaced by `{}`. */
export function pathShape(pathAndQuery: string): string {
  const qIndex = pathAndQuery.indexOf("?");
  const path = qIndex >= 0 ? pathAndQuery.slice(0, qIndex) : pathAndQuery;
  const query = qIndex >= 0 ? pathAndQuery.slice(qIndex + 1) : "";
  const shapedPath = path
    .split("/")
    .map((seg) => (NUM_RE.test(seg) || GUID_RE.test(seg) ? "{}" : seg))
    .join("/");
  if (!query) return shapedPath;
  const shapedQuery = query
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq >= 0 ? `${pair.slice(0, eq)}={}` : pair;
    })
    .join("&");
  return `${shapedPath}?${shapedQuery}`;
}

/** `METHOD host[:port]/path/shape?q={}` for an http.client span. */
export function httpShape(span: Span): string {
  const method = String(span.attributes["http.request.method"] ?? "GET").toUpperCase();
  const full = span.attributes["url.full"];
  if (typeof full === "string") {
    try {
      const u = new URL(full);
      return `${method} ${u.host}${pathShape(u.pathname + u.search)}`;
    } catch {
      // fall through to the parts below
    }
  }
  const host = span.attributes["server.address"];
  const port = span.attributes["server.port"];
  const path = String(span.attributes["url.path"] ?? span.name);
  return `${method} ${host ?? ""}${port ? `:${port}` : ""}${pathShape(path)}`;
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const sum = (spans: readonly Span[]) => spans.reduce((t, s) => t + s.durationMs, 0);

export function findDuplicateQueries(trace: Trace): Finding[] {
  const known = repeatableQueries(trace).filter((s) => !hasUnknownParams(s));
  const groups = groupBy(known, (s) => `${queryText(s)}\u0000${valuesOf(s)}`);
  const out: Finding[] = [];
  for (const spans of groups.values()) {
    if (spans.length < 2) continue;
    out.push({
      kind: "duplicate-query",
      severity: "warning",
      title: `Same query with same parameters ran ${spans.length} times`,
      shape: queryText(spans[0]!),
      count: spans.length,
      totalMs: sum(spans),
      spanIds: spans.map((s) => s.spanId),
    });
  }
  return out;
}

/** `SELECT set_config(...)` run before each transaction, as row-level security setups do: not a query per row. */
export const isSetConfigPreamble = (text: string): boolean => /^\s*select\s+(?:pg_catalog\.)?set_config\s*\(/i.test(text);

export function findNPlusOneDb(trace: Trace, minRepeats = 5): Finding[] {
  const out: Finding[] = [];
  for (const [text, spans] of groupBy(repeatableQueries(trace), queryText)) {
    if (spans.length < minRepeats) continue;
    const preamble = isSetConfigPreamble(text);
    out.push({
      kind: "n+1-db",
      severity: preamble ? "info" : "warning",
      title: preamble ? `Session setup (set_config) ran ${spans.length} times, once per transaction` : `N+1 query: ran ${spans.length} times`,
      shape: text,
      count: spans.length,
      totalMs: sum(spans),
      spanIds: spans.map((s) => s.spanId),
    });
  }
  return out;
}

export function findNPlusOneHttp(trace: Trace, minRepeats = 5): Finding[] {
  const out: Finding[] = [];
  const clients = trace.spans.filter((s) => s.category === "http.client");
  for (const [shape, spans] of groupBy(clients, httpShape)) {
    if (spans.length < minRepeats) continue;
    out.push({
      kind: "n+1-http",
      severity: "warning",
      title: `N+1 HTTP: called ${spans.length} times`,
      shape,
      count: spans.length,
      totalMs: sum(spans),
      spanIds: spans.map((s) => s.spanId),
    });
  }
  return out;
}

export interface ErrorInfo {
  spanId: string;
  service: string;
  name: string;
  message: string;
  type: string | null;
  stack: string | null;
}

/** "HTTP 500" for a failed span that names no reason but has a status, as ASP.NET marks a 5xx it did not throw for. */
function httpReason(span: Span): string | null {
  const status = Number(span.attributes["http.response.status_code"]);
  return status >= 400 && status <= 599 ? `HTTP ${status}` : null;
}

export function errorInfo(span: Span): ErrorInfo {
  const ex = span.events.find((e) => e.name === "exception");
  const attr = (k: string) => (ex?.attributes[k] == null ? null : String(ex.attributes[k]));
  return {
    spanId: span.spanId,
    service: span.service,
    name: span.name,
    message: attr("exception.message") ?? (span.statusMessage || httpReason(span)) ?? "error",
    type: attr("exception.type"),
    stack: attr("exception.stacktrace"),
  };
}

export function findErrors(trace: Trace): Finding[] {
  return errorSpansOf(trace.spans).map((s) => ({
    kind: "error" as const,
    severity: "error" as const,
    title: `${s.service}: ${errorInfo(s).message}`,
    shape: s.name,
    count: 1,
    totalMs: s.durationMs,
    spanIds: [s.spanId],
  }));
}

/** The thresholds `analyzeTrace` uses when none are given. */
export const ANALYSIS_DEFAULTS = { nPlusOneThreshold: 5, slowQueryMs: 100 } as const;

/** Run every analysis on one trace. */
export function analyzeTrace(trace: Trace, options: AnalysisOptions = {}): Finding[] {
  const n = options.nPlusOneThreshold ?? ANALYSIS_DEFAULTS.nPlusOneThreshold;
  return [
    ...findErrors(trace),
    ...findNPlusOneDb(trace, n),
    ...findNPlusOneHttp(trace, n),
    ...findDuplicateQueries(trace),
    ...findSlowQueries(trace, options.slowQueryMs ?? ANALYSIS_DEFAULTS.slowQueryMs),
    ...findSecurity(trace),
    ...findSlowPages(trace),
  ];
}
