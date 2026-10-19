// The page of one API endpoint: count, errors, and percentiles over time, its slowest requests, queries, calls, and errors.
import { type Agg, avgOfAgg } from "../scale/agg.js";
import type { RequestItem } from "../scale/facts-lists.js";
import { histPercentile } from "../scale/hist.js";
import { joinKey, splitKey } from "../scale/kinds.js";
import type { NeedResults, PageDef } from "../scale/needs.js";
import { bucketStarts, percentOf } from "../stats/common.js";
import { displayService, type ErrorGroup, rawService } from "../stats/errors.js";
import { CHART_BUCKETS } from "./database.js";
import { errorGroupOf } from "./errors.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { byDesc, counts, groupNeed, listNeed, listOf, type Row, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";
import { type UsersAffected, usersNeed, usersOf } from "./user-rows.js";

const LIST = 50;

export interface EndpointTotals {
  count: number;
  errors: number;
  errorRate: number;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

/** A target or query of the endpoint, with its numbers. */
export interface EndpointPart {
  name: string;
  count: number;
  errors: number;
  avgMs: number | null;
}

export interface EndpointPageModel {
  meta: ModelMeta;
  /** The service (its Services row name) and the endpoint, as asked. */
  service: string;
  endpoint: string;
  /** Null when the endpoint served nothing in the range. */
  totals: EndpointTotals | null;
  prev: EndpointTotals | null;
  starts: number[];
  chart: { count: Series; errors: Series; p50: Series; p95: Series; p99: Series; prevCount: Series };
  /** Requests that started at this endpoint, slowest first. */
  slowest: RequestItem[];
  /** The newest requests that went through it (also when it served another service's call). */
  recent: RequestItem[];
  queries: EndpointPart[];
  calls: EndpointPart[];
  errors: ErrorGroup[];
  /** Signed-in users who called it in the range. */
  users: UsersAffected;
}

const pct = (a: Agg, p: number) => (a.hist && a.n ? histPercentile(a.hist, a.n, p) : null);

function totalsOf(a: Agg): EndpointTotals | null {
  return a.n ? { count: a.n, errors: a.err, errorRate: percentOf(a.err, a.n), avgMs: avgOfAgg(a), p50Ms: pct(a, 50), p95Ms: pct(a, 95), p99Ms: pct(a, 99) } : null;
}

const partsOf = (rows: readonly Row[]): EndpointPart[] =>
  [...rows].sort(byDesc((r) => r.agg.n)).map((r) => ({ name: splitKey(r.key).at(-1)!, count: r.agg.n, errors: r.agg.err, avgMs: avgOfAgg(r.agg) }));

/** The Services row key and endpoint name from params: `service` is a row key ("api:orders") or a service name. */
function idOf(p: Readonly<Record<string, string>>): { rowKey: string; name: string; endpoint: string; key: string } {
  const service = p.service ?? "";
  const rowKey = service.includes(":") ? service : `api:${service}`;
  const endpoint = p.endpoint ?? "";
  return { rowKey, name: rowKey.slice(rowKey.indexOf(":") + 1), endpoint, key: joinKey(rowKey, endpoint) };
}

function chartOf(d: NeedResults): EndpointPageModel["chart"] {
  const s = seriesOf(d, "chart", CHART_BUCKETS);
  return { count: counts(s), errors: s.map((a) => a.err), p50: s.map((a) => pct(a, 50)), p95: s.map((a) => pct(a, 95)), p99: s.map((a) => pct(a, 99)), prevCount: counts(seriesOf(d, "chart.prev", CHART_BUCKETS)) };
}

/** The Endpoint page. Params: service (row key or name), endpoint ("GET /api/orders/{id}"). */
export const endpointPage: PageDef<EndpointPageModel> = {
  needs: (ctx) => {
    const id = idOf(ctx.params);
    const keys = { filter: { keys: [id.key] } };
    const order = { by: "n", desc: true, limit: LIST } as const;
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("ep", "svc.ep", "cur", { hist: true, ids: true, ...keys }),
      groupNeed("ep.prev", "svc.ep", "prev", { hist: true, ...keys }),
      seriesNeed("chart", "svc.ep", "cur", CHART_BUCKETS, { hist: true, ...keys }),
      seriesNeed("chart.prev", "svc.ep", "prev", CHART_BUCKETS, keys),
      groupNeed("q", "ep.q", "cur", { filter: { prefix: joinKey(id.key, "") }, order }),
      groupNeed("call", "ep.call", "cur", { filter: { prefix: joinKey(id.key, "") }, order }),
      groupNeed("ge", "err.ge", "cur", { filter: { prefix: `${displayService(id.name)}|`, parts: [null, id.endpoint] } }),
      listNeed("slowest", "requests", "cur", { filter: { endpoint: id.endpoint, service: rawService(id.name) }, sort: { key: "duration", desc: true }, limit: 10 }),
      usersNeed("users", "ep.u", [displayService(id.name), id.endpoint]),
    ]);
  },
  followUp(_ctx, first) {
    const ids = rowsOf(first, "ep")[0]?.agg.ids ?? [];
    const groups = [...new Set(rowsOf(first, "ge").map((r) => splitKey(r.key)[0]!))];
    return [
      ...(ids.length ? [listNeed("recent", "requests", "cur", { filter: { traceIds: ids }, limit: ids.length })] : []),
      ...(groups.length ? [groupNeed("errors", "err.g", "cur", { top: true, filter: { keys: groups }, order: { by: "n", desc: true, limit: LIST } })] : []),
    ];
  },
  model(d) {
    const id = idOf(d.params);
    return {
      meta: metaOf(d),
      service: id.name,
      endpoint: id.endpoint,
      totals: totalsOf(totalOf(d, "ep")),
      prev: totalsOf(totalOf(d, "ep.prev")),
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: chartOf(d),
      slowest: listOf<RequestItem>(d, "slowest").items,
      recent: listOf<RequestItem>(d, "recent").items,
      queries: partsOf(rowsOf(d, "q")),
      calls: partsOf(rowsOf(d, "call")),
      errors: rowsOf(d, "errors").map((r) => errorGroupOf(r)),
      users: usersOf(d, "users"),
    };
  },
};
