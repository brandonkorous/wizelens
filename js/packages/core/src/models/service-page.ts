// The full page of one service: its numbers over time, endpoints, callers, and (for your own services) errors, slow requests, and logs.
import type { RequestItem } from "../scale/facts-lists.js";
import { histPercentile } from "../scale/hist.js";
import { joinKey } from "../scale/kinds.js";
import type { Need, NeedResults, PageDef } from "../scale/needs.js";
import { bucketStarts } from "../stats/common.js";
import { displayService, type ErrorGroup } from "../stats/errors.js";
import type { LogRow } from "../stats/logs.js";
import type { ServiceEdge, ServiceKind, ServiceRow } from "../stats/services.js";
import { CHART_BUCKETS, MODEL_LIST_MAX } from "./database.js";
import { errorGroupOf } from "./errors.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { aggByKey, avgs, byDesc, counts, groupCount, groupNeed, listNeed, listOf, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";
import { edgesOf, endpointPrefix, type EndpointStat, endpointStatsOf, findRow } from "./service-detail.js";
import { edgeNeeds, edgesOfRows, serviceNeeds, serviceRowsOf } from "./service-rows.js";

const TOP_ERRORS = 50;
const SLOWEST = 10;
const RECENT_LOGS = 10;

/** Kinds that run your code: their errors, requests, logs, metrics, and hosts carry the service's name. */
const OWNED: ReadonlySet<ServiceKind> = new Set(["api", "worker"]);

export const isOwnedService = (kind: ServiceKind): boolean => OWNED.has(kind);

export interface ServicePageErrors {
  /** The most frequent error groups, at most 50. */
  groups: ErrorGroup[];
  /** Error groups before the limit. */
  total: number;
  exceptions: number;
  prevExceptions: number;
}

export interface ServicePageLogs {
  /** The newest lines. */
  rows: LogRow[];
  total: number;
  warnings: number;
  errors: number;
}

export interface ServicePageModel {
  meta: ModelMeta;
  /** The service in this range; null when it did nothing in it. */
  row: ServiceRow | null;
  /** The same service in the window before, for the changes. */
  prevRow: ServiceRow | null;
  /** True for services that run your code (APIs and workers). Only they have errors, requests, and logs here. */
  owned: boolean;
  starts: number[];
  chart: { requests: Series; errors: Series; avgMs: Series; p95Ms: Series };
  /** Busiest first, at most 200. */
  endpoints: EndpointStat[];
  endpointCount: number;
  incoming: ServiceEdge[];
  outgoing: ServiceEdge[];
  errors: ServicePageErrors;
  /** The slowest requests that went through this service, and how many did. */
  slowest: RequestItem[];
  requestCount: number;
  logs: ServicePageLogs;
}

/** Needs for an owned service's errors, requests, and logs, by its display name. */
function ownedNeeds(name: string): Need[] {
  const shown = displayService(name);
  return [
    groupNeed("err.g", "err.g", "cur", { top: true, filter: { prefix: `${shown}|` }, order: { by: "n", desc: true, limit: TOP_ERRORS } }),
    groupNeed("err.cur", "err.s", "cur", { filter: { keys: [shown] } }),
    groupNeed("err.prev", "err.s", "prev", { filter: { keys: [shown] } }),
    listNeed("slowest", "requests", "cur", { filter: { service: name }, sort: { key: "duration", desc: true }, limit: SLOWEST, count: true }),
    listNeed("logs", "logs", "cur", { filter: { logService: shown }, limit: RECENT_LOGS, count: true }),
    groupNeed("log.s", "log.s", "cur", { filter: { parts: [shown, null] } }),
  ];
}

function errorsOf(d: NeedResults): ServicePageErrors {
  const groups = [...rowsOf(d, "err.g")].sort(byDesc((r) => r.agg.n)).map((r) => errorGroupOf(r));
  return { groups, total: groupCount(d, "err.g"), exceptions: totalOf(d, "err.cur").n, prevExceptions: totalOf(d, "err.prev").n };
}

function logsOf(d: NeedResults, name: string): ServicePageLogs {
  const list = listOf<LogRow>(d, "logs");
  const by = aggByKey(d, "log.s");
  const n = (level: string) => by.get(joinKey(displayService(name), level))?.n ?? 0;
  return { rows: list.items, total: list.total ?? list.items.length, warnings: n("warn"), errors: n("error") + n("critical") };
}

function chartOf(d: NeedResults): ServicePageModel["chart"] {
  const s = seriesOf(d, "chart", CHART_BUCKETS);
  return { requests: counts(s), errors: s.map((a) => a.err), avgMs: avgs(s), p95Ms: s.map((a) => (a.hist && a.n ? histPercentile(a.hist, a.n, 95) : null)) };
}

const NO_ERRORS: ServicePageErrors = { groups: [], total: 0, exceptions: 0, prevExceptions: 0 };
const NO_LOGS: ServicePageLogs = { rows: [], total: 0, warnings: 0, errors: 0 };

/** The Service page. Params: service (a Services row key, or a service name). */
export const servicePage: PageDef<ServicePageModel> = {
  needs: () => uniqueNeeds([...META_NEEDS, ...serviceNeeds("cur"), ...serviceNeeds("prev"), ...edgeNeeds()]),
  followUp(ctx, first) {
    const row = findRow(serviceRowsOf(first, "cur"), ctx.params.service ?? null);
    if (!row) return [];
    return [
      groupNeed("svc.ep", "svc.ep", "cur", { filter: { prefix: endpointPrefix(row.key) }, order: { by: "n", desc: true, limit: MODEL_LIST_MAX } }),
      seriesNeed("chart", "svc", "cur", CHART_BUCKETS, { filter: { keys: [row.key] }, hist: true }),
      ...(isOwnedService(row.kind) ? ownedNeeds(row.name) : []),
    ];
  },
  model(d) {
    const row = findRow(serviceRowsOf(d, "cur"), d.params.service ?? null);
    const owned = !!row && isOwnedService(row.kind);
    const slowest = listOf<RequestItem>(d, "slowest");
    return {
      meta: metaOf(d),
      row,
      prevRow: row ? (serviceRowsOf(d, "prev").find((r) => r.key === row.key) ?? null) : null,
      owned,
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: chartOf(d),
      endpoints: row ? endpointStatsOf([...rowsOf(d, "svc.ep")].sort(byDesc((r) => r.agg.n)), row.key) : [],
      endpointCount: groupCount(d, "svc.ep"),
      ...(row ? edgesOf(edgesOfRows(d), row.name) : { incoming: [], outgoing: [] }),
      errors: owned ? errorsOf(d) : NO_ERRORS,
      slowest: slowest.items,
      requestCount: slowest.total ?? slowest.items.length,
      logs: owned && row ? logsOf(d, row.name) : NO_LOGS,
    };
  },
};
