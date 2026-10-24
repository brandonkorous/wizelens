import { httpShape, queryText } from "../analysis.js";
import { spanEndpointName } from "../endpoint.js";
import { avgOfAgg } from "../scale/agg.js";
import { joinKey } from "../scale/kinds.js";
import { normalizeQuery } from "../stats/common.js";
import { type ServiceEdge, type ServiceKind, type ServiceRow } from "../stats/services.js";
import { isFailedAnswer } from "../trace.js";
import type { Span } from "../types.js";
import type { Row } from "./read.js";

/** One endpoint, query, or call target of a service, with its numbers. */
export interface EndpointStat {
  name: string;
  count: number;
  avgMs: number | null;
  errors: number;
}

export const failedSpan = (s: Span) => isFailedAnswer(s);

/** The endpoint, query, or call shape a span counts as in a service row of this kind. */
export function endpointNameOf(s: Span, kind: ServiceKind): string {
  if (kind === "database") return normalizeQuery(queryText(s));
  if (kind === "external") return httpShape(s);
  return spanEndpointName(s);
}

/** Key prefix of a row's `svc.ep` keys. */
export const endpointPrefix = (rowKey: string): string => joinKey(rowKey, "");

/** Endpoint stats from `svc.ep` rows of one service row, in the order given. */
export function endpointStatsOf(rows: readonly Row[], rowKey: string): EndpointStat[] {
  const prefix = endpointPrefix(rowKey);
  return rows.map(({ key, agg }) => ({ name: key.slice(prefix.length), count: agg.n, avgMs: avgOfAgg(agg), errors: agg.err }));
}

/** Calls into and out of one service. */
export function edgesOf(edges: readonly ServiceEdge[], name: string): { incoming: ServiceEdge[]; outgoing: ServiceEdge[] } {
  return { incoming: edges.filter((e) => e.to === name), outgoing: edges.filter((e) => e.from === name) };
}

/** Find the selected row by key first, then by name (search links use the name). */
export const findRow = (rows: readonly ServiceRow[], wanted: string | null): ServiceRow | null =>
  wanted ? (rows.find((r) => r.key === wanted) ?? rows.find((r) => r.name === wanted) ?? null) : null;
