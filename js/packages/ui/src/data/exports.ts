// What each list page exports as CSV: its rows and columns, from the page model loaded with up to 5000 rows.
import type { ErrorGroup, InsightGroup, LogRow, ModelOf, QueryRow, SecurityGroup, TraceListItem } from "@wizeworks/lens-core";
import { type CsvColumns, isoTime, round2, toCsv } from "./csv";

const ERRORS: CsvColumns<ErrorGroup> = [
  ["last_seen", (g) => isoTime(g.lastSeenMs)],
  ["first_seen", (g) => isoTime(g.firstSeenMs)],
  ["service", (g) => g.service],
  ["type", (g) => g.type],
  ["message", (g) => g.message],
  ["endpoint", (g) => g.endpoint],
  ["count", (g) => g.count],
  ["critical", (g) => g.critical],
  ["latest_trace_id", (g) => g.latest.traceId],
  ["group", (g) => g.key],
];

const LOGS: CsvColumns<LogRow> = [
  ["time", (r) => isoTime(r.timeMs)],
  ["level", (r) => r.level],
  ["service", (r) => r.service],
  ["category", (r) => r.category],
  ["message", (r) => r.message],
  ["trace", (r) => r.traceName],
  ["trace_id", (r) => r.traceId],
  ["span_id", (r) => r.spanId],
];

const QUERIES: CsvColumns<QueryRow> = [
  ["query", (q) => q.query],
  ["system", (q) => q.system],
  ["count", (q) => q.count],
  ["avg_ms", (q) => round2(q.avgMs)],
  ["p95_ms", (q) => (q.p95Ms === null ? "" : round2(q.p95Ms))],
  ["max_ms", (q) => round2(q.maxMs)],
  ["total_ms", (q) => round2(q.totalMs)],
  ["slow", (q) => q.slow],
  ["errors", (q) => q.errors],
  ["endpoints", (q) => q.endpoints.join(" ")],
  ["example_trace_id", (q) => q.exampleTraceId],
];

const TRACES: CsvColumns<TraceListItem> = [
  ["trace_id", (t) => t.traceId],
  ["path", (t) => t.path],
  ["duration_ms", (t) => round2(t.durationMs)],
  ["status", (t) => t.status],
  ["health", (t) => t.health],
  ["services", (t) => t.services.join(" ")],
];

const INSIGHTS: CsvColumns<InsightGroup> = [
  ["impact", (g) => g.impact],
  ["area", (g) => g.area],
  ["title", (g) => g.title],
  ["shape", (g) => g.shape],
  ["seen_in", (g) => g.occurrences],
  ["repeats", (g) => g.count],
  ["total_ms", (g) => round2(g.totalMs)],
  ["endpoints", (g) => g.endpoints.join(" ")],
  ["last_seen", (g) => isoTime(g.lastSeenMs)],
  ["example_trace_id", (g) => g.exampleTraceId],
];

const SECURITY: CsvColumns<SecurityGroup> = [
  ["severity", (g) => g.severity],
  ["owasp", (g) => g.owasp],
  ["kind", (g) => g.kind],
  ["title", (g) => g.title],
  ["evidence", (g) => g.shape],
  ["seen_in", (g) => g.occurrences],
  ["found", (g) => g.count],
  ["endpoints", (g) => g.endpoints.join(" ")],
  ["first_seen", (g) => isoTime(g.firstSeenMs)],
  ["last_seen", (g) => isoTime(g.lastSeenMs)],
  ["example_trace_id", (g) => g.exampleTraceId ?? ""],
];

/** Pages with an Export button, and how each turns its model into CSV. */
export const EXPORTS = {
  errors: (m: ModelOf<"errors">) => toCsv(ERRORS, m.groups),
  logs: (m: ModelOf<"logs">) => toCsv(LOGS, m.rows),
  database: (m: ModelOf<"database">) => toCsv(QUERIES, m.queries),
  traces: (m: ModelOf<"traces">) => toCsv(TRACES, m.recent),
  insights: (m: ModelOf<"insights">) => toCsv(INSIGHTS, m.groups),
  security: (m: ModelOf<"security">) => toCsv(SECURITY, m.groups),
} as const;

export type ExportPage = keyof typeof EXPORTS;
