// Services rows and edges from the svc and edge rollups, like `serviceRows` and `serviceEdges`.
import { avgOfAgg } from "../scale/agg.js";
import type { ServiceRowInfo } from "../scale/facts-services.js";
import { histPercentile } from "../scale/hist.js";
import type { Need, NeedResults, WindowRef } from "../scale/needs.js";
import { percentOf } from "../stats/common.js";
import { type ServiceEdge, type ServiceKind, type ServiceRow, statusOf } from "../stats/services.js";
import { byDesc, groupNeed, type Row, rowsOf } from "./read.js";

const RANK: Record<ServiceKind, number> = { api: 0, web: 1, database: 2, external: 3, queue: 4, worker: 5 };

export const serviceRowsId = (win: WindowRef) => `svc.${win}`;
export const EDGES_ID = "edge.cur";

/** Needs for the service rows of a window. The hist gives p95. */
export const serviceNeeds = (win: WindowRef): Need[] => [groupNeed(serviceRowsId(win), "svc", win, { hist: true, top: true })];

export const edgeNeeds = (): Need[] => [groupNeed(EDGES_ID, "edge", "cur", { top: true, hist: true })];

function rowOf({ key, agg }: Row): ServiceRow {
  const info = agg.top as ServiceRowInfo;
  const errorRate = percentOf(agg.err, agg.n);
  const p95Ms = agg.hist ? histPercentile(agg.hist, agg.n, 95) : null;
  return { key, name: info.name, kind: info.kind, status: statusOf(agg.n, errorRate, p95Ms), requests: agg.n, errors: agg.err, errorRate, avgMs: avgOfAgg(agg), p95Ms, detail: info.detail };
}

/** Services, databases, hosts, queues, and workers, busiest first. Workers that also serve requests show as their api row. */
export function serviceRowsOf(d: NeedResults, win: WindowRef): ServiceRow[] {
  const rows = rowsOf(d, serviceRowsId(win));
  const apis = new Set(rows.filter((r) => r.key.startsWith("api:")).map((r) => r.key.slice(4)));
  const kept = rows.filter((r) => !(r.key.startsWith("worker:") && apis.has(r.key.slice(7)))).map(rowOf);
  return kept.sort((a, b) => b.requests - a.requests || RANK[a.kind] - RANK[b.kind]);
}

/** Who calls whom, busiest first. */
export function edgesOfRows(d: NeedResults): ServiceEdge[] {
  return [...rowsOf(d, EDGES_ID)].sort(byDesc((r) => r.agg.n)).map(({ agg }) => {
    const { from, to } = agg.top as { from: string; to: string };
    return { from, to, calls: agg.n, avgMs: avgOfAgg(agg), errors: agg.err, p95Ms: agg.hist ? histPercentile(agg.hist, agg.n, 95) : null };
  });
}
