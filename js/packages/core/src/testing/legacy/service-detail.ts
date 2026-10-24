import { httpShape, queryText } from "../../analysis.js";
import { isWebAppCall } from "../../attributes.js";
import { spanEndpointName } from "../../endpoint.js";
import { avgOf, groupBy, normalizeQuery } from "../../stats/common.js";
import { databaseOf, hostOf, type ServiceEdge, type ServiceKind, type ServiceRow } from "../../stats/services.js";
import { isFailedAnswer } from "../../trace.js";
import type { Span, Trace } from "../../types.js";

/** One endpoint, query, or call target of a service, with its numbers. */
export interface EndpointStat {
  name: string;
  count: number;
  avgMs: number | null;
  errors: number;
}

export const failedSpan = (s: Span) => isFailedAnswer(s);

function externalSpans(traces: readonly Trace[]): Span[] {
  const out: Span[] = [];
  for (const t of traces) {
    const answered = new Set(t.spans.filter((s) => s.category === "http.server").map((s) => s.parentSpanId));
    for (const s of t.spans) if (s.category === "http.client" && !answered.has(s.spanId)) out.push(s);
  }
  return out;
}

/** The spans a service row counts: its server spans, queries, browser fetches, or outside calls. */
export function spansOfRow(traces: readonly Trace[], row: ServiceRow): Span[] {
  if (row.kind === "external") return externalSpans(traces).filter((s) => hostOf(s) === row.name);
  const all = traces.flatMap((t) => t.spans);
  if (row.kind === "web") return all.filter(isWebAppCall);
  if (row.kind === "database") return all.filter((s) => s.category === "db" && databaseOf(s) === row.name);
  return all.filter((s) => s.category === "http.server" && s.service === row.name);
}

/** The endpoint, query, or call shape a span counts as in a service row of this kind. */
export function endpointNameOf(s: Span, kind: ServiceKind): string {
  if (kind === "database") return normalizeQuery(queryText(s));
  if (kind === "external") return httpShape(s);
  return spanEndpointName(s);
}

/** Busiest endpoints (or queries, or call shapes) of one service row. */
export function endpointsOf(spans: readonly Span[], row: ServiceRow, limit = 10): EndpointStat[] {
  return [...groupBy(spans, (s) => endpointNameOf(s, row.kind))]
    .map(([name, list]) => ({ name, count: list.length, avgMs: avgOf(list.map((s) => s.durationMs)), errors: list.filter(failedSpan).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Calls into and out of one service. */
export function edgesOf(edges: readonly ServiceEdge[], name: string): { incoming: ServiceEdge[]; outgoing: ServiceEdge[] } {
  return { incoming: edges.filter((e) => e.to === name), outgoing: edges.filter((e) => e.from === name) };
}

/** Find the selected row by key first, then by name (search links use the name). */
export const findRow = (rows: readonly ServiceRow[], wanted: string | null): ServiceRow | null =>
  wanted ? (rows.find((r) => r.key === wanted) ?? rows.find((r) => r.name === wanted) ?? null) : null;
