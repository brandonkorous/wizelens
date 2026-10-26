// The full page of one service: its numbers over time, endpoints, callers, and (for your own services) errors, slow requests, and logs.
import type { RequestItem } from "../scale/facts-lists.js";
import { histPercentile } from "../scale/hist.js";
import { joinKey } from "../scale/kinds.js";
import type { Need, NeedResults, PageData, PageDef } from "../scale/needs.js";
import { bucketStarts } from "../stats/common.js";
import { displayService, type ErrorGroup } from "../stats/errors.js";
import type { LogRow } from "../stats/logs.js";
import type { ServiceEdge, ServiceKind, ServiceRow } from "../stats/services.js";
import { CHART_BUCKETS } from "./database.js";
import { errorGroupOf } from "./errors.js";
import { META_NEEDS, type ModelMeta, type ModelParams, metaOf } from "./input.js";
import { groupPage, type PageInfo } from "./paged.js";
import { aggByKey, avgs, counts, groupCount, groupNeed, listNeed, listOf, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";
import { edgesOf, endpointPrefix, type EndpointStat, endpointStatsOf, findRow } from "./service-detail.js";
import { edgeNeeds, edgesOfRows, serviceNeeds, serviceRowsOf } from "./service-rows.js";
import { type VersionStat, versionNeeds, versionsOf } from "./service-versions.js";
import type { Apdex } from "./apdex.js";
import { apdexByService, apdexNeed } from "./apdex-rows.js";
import { type StreamStats, streamNeed, streamsOf } from "./stream-stats.js";

/** Endpoints ("ep") and error groups ("err") a page shows at first. */
export const SERVICE_PAGE_SIZE = 10;
const BY_COUNT = { key: "count", desc: true };
const endpointPage = (p: ModelParams) => groupPage(p, "ep", SERVICE_PAGE_SIZE, { count: "n", errors: "err", avg: "avg" }, BY_COUNT);
const errorPage = (p: ModelParams) => groupPage(p, "err", SERVICE_PAGE_SIZE, { count: "n", seen: "lastMs" }, BY_COUNT);
const SLOWEST = 10;
const RECENT_LOGS = 10;

/** Kinds that run your code: their errors, requests, logs, metrics, and hosts carry the service's name. */
const OWNED: ReadonlySet<ServiceKind> = new Set(["api", "worker"]);

export const isOwnedService = (kind: ServiceKind): boolean => OWNED.has(kind);

export interface ServicePageErrors {
  /** One page of the error groups, most frequent first or in the `errsort` column's order. */
  groups: ErrorGroup[];
  total: number;
  paging: PageInfo;
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
  /** `prevRequests`: the compared period's count per bucket, for a faint line. */
  chart: { requests: Series; errors: Series; avgMs: Series; p95Ms: Series; prevRequests: Series };
  /** One page of the endpoints, busiest first or in the `epsort` column's order. */
  endpoints: EndpointStat[];
  endpointCount: number;
  endpointPaging: PageInfo;
  incoming: ServiceEdge[];
  outgoing: ServiceEdge[];
  errors: ServicePageErrors;
  /** The slowest requests that went through this service, and how many did. */
  slowest: RequestItem[];
  requestCount: number;
  logs: ServicePageLogs;
  /** The service's newest versions compared (your own services that send a version). */
  versions: VersionStat[];
  /** Apdex against the service's target (your own services). */
  apdex: Apdex | null;
  /** Streams it served; their open time is not in its latency. Null when none. */
  streams: StreamStats | null;
}

/** Needs for an owned service's errors, requests, and logs, by its display name. */
function ownedNeeds(name: string, p: ModelParams): Need[] {
  const shown = displayService(name);
  return [
    groupNeed("err.g", "err.g", "cur", { top: true, filter: { prefix: `${shown}|` }, order: errorPage(p).order }),
    groupNeed("err.cur", "err.s", "cur", { filter: { keys: [shown] } }),
    groupNeed("err.prev", "err.s", "prev", { filter: { keys: [shown] } }),
    listNeed("slowest", "requests", "cur", { filter: { service: name }, sort: { key: "duration", desc: true }, limit: SLOWEST, count: true }),
    listNeed("logs", "logs", "cur", { filter: { logService: shown }, limit: RECENT_LOGS, count: true }),
    groupNeed("log.s", "log.s", "cur", { filter: { parts: [shown, null] } }),
    ...versionNeeds(shown),
  ];
}

function errorsOf(d: PageData): ServicePageErrors {
  const groups = rowsOf(d, "err.g").map((r) => errorGroupOf(r));
  const total = groupCount(d, "err.g");
  return { groups, total, paging: errorPage(d.params).paging(total), exceptions: totalOf(d, "err.cur").n, prevExceptions: totalOf(d, "err.prev").n };
}

function logsOf(d: NeedResults, name: string): ServicePageLogs {
  const list = listOf<LogRow>(d, "logs");
  const by = aggByKey(d, "log.s");
  const n = (level: string) => by.get(joinKey(displayService(name), level))?.n ?? 0;
  return { rows: list.items, total: list.total ?? list.items.length, warnings: n("warn"), errors: n("error") + n("critical") };
}

function chartOf(d: NeedResults): ServicePageModel["chart"] {
  const s = seriesOf(d, "chart", CHART_BUCKETS);
  const prevRequests = counts(seriesOf(d, "chart.prev", CHART_BUCKETS));
  return { requests: counts(s), errors: s.map((a) => a.err), avgMs: avgs(s), p95Ms: s.map((a) => (a.hist && a.n ? histPercentile(a.hist, a.n, 95) : null)), prevRequests };
}

const noErrors = (p: ModelParams): ServicePageErrors => ({ groups: [], total: 0, paging: errorPage(p).paging(0), exceptions: 0, prevExceptions: 0 });
const NO_LOGS: ServicePageLogs = { rows: [], total: 0, warnings: 0, errors: 0 };

/** The Service page. Params: service (a Services row key, or a service name); eppage, epsize, epsort; errpage, errsize, errsort. */
export const servicePage: PageDef<ServicePageModel> = {
  needs: () => uniqueNeeds([...META_NEEDS, ...serviceNeeds("cur"), ...serviceNeeds("prev"), ...edgeNeeds()]),
  followUp(ctx, first) {
    const row = findRow(serviceRowsOf(first, "cur"), ctx.params.service ?? null);
    if (!row) return [];
    return [
      groupNeed("svc.ep", "svc.ep", "cur", { filter: { prefix: endpointPrefix(row.key) }, order: endpointPage(ctx.params).order }),
      seriesNeed("chart", "svc", "cur", CHART_BUCKETS, { filter: { keys: [row.key] }, hist: true }),
      seriesNeed("chart.prev", "svc", "prev", CHART_BUCKETS, { filter: { keys: [row.key] } }),
      streamNeed("streams", "svc.stream", row.key),
      ...(isOwnedService(row.kind) ? [...ownedNeeds(row.name, ctx.params), apdexNeed(row.key)] : []),
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
      endpoints: row ? endpointStatsOf(rowsOf(d, "svc.ep"), row.key) : [],
      endpointCount: groupCount(d, "svc.ep"),
      endpointPaging: endpointPage(d.params).paging(groupCount(d, "svc.ep")),
      ...(row ? edgesOf(edgesOfRows(d), row.name) : { incoming: [], outgoing: [] }),
      errors: owned ? errorsOf(d) : noErrors(d.params),
      slowest: slowest.items,
      requestCount: slowest.total ?? slowest.items.length,
      logs: owned && row ? logsOf(d, row.name) : NO_LOGS,
      versions: owned && row ? versionsOf(d, displayService(row.name)) : [],
      apdex: owned && row ? (apdexByService(d).get(displayService(row.name)) ?? null) : null,
      streams: row ? streamsOf(d, "streams") : null,
    };
  },
};
