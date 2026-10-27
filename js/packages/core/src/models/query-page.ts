// The page of one query shape: count and time over time, the services and endpoints that run it, and the traces that ran it.
import { type Agg, avgOfAgg } from "../scale/agg.js";
import type { QueryTop } from "../scale/facts-db.js";
import { histPercentile } from "../scale/hist.js";
import type { TraceItem } from "../scale/facts-lists.js";
import { splitKey } from "../scale/kinds.js";
import type { PageDef } from "../scale/needs.js";
import { bucketStarts } from "../stats/common.js";
import { CHART_BUCKETS } from "./database.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { avgs, byDesc, counter, counts, groupNeed, listNeed, listOf, type Row, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";

export interface QueryTotals {
  count: number;
  avgMs: number | null;
  /** Null when the runs were stored without their spread. */
  p95Ms: number | null;
  totalMs: number;
  slow: number;
  errors: number;
}

export interface QueryUse {
  service: string;
  /** "" in the per-service list. */
  endpoint: string;
  count: number;
  avgMs: number | null;
}

export interface QueryPageModel {
  meta: ModelMeta;
  query: string;
  slowMs: number;
  /** Null when the query did not run in the range. */
  totals: QueryTotals | null;
  prev: QueryTotals | null;
  /** The slowest run: its time, database system, and trace. */
  slowest: QueryTop | null;
  starts: number[];
  chart: { count: Series; avgMs: Series; slow: Series; prevCount: Series };
  services: QueryUse[];
  endpoints: QueryUse[];
  /** The newest traces that ran it (requests and jobs). */
  traces: TraceItem[];
}

const totalsOf = (a: Agg): QueryTotals | null => (a.n ? { count: a.n, avgMs: avgOfAgg(a), p95Ms: a.hist ? histPercentile(a.hist, a.n, 95) : null, totalMs: a.sum, slow: a.c[0] ?? 0, errors: a.err } : null);

/** A per-service row ("service", query) or a per-endpoint row ("api:service", endpoint, query). */
function useOf(r: Row, byEndpoint: boolean): QueryUse {
  const [head = "", endpoint = ""] = splitKey(r.key);
  const service = byEndpoint ? head.slice(head.indexOf(":") + 1) : head;
  return { service, endpoint: byEndpoint ? endpoint : "", count: r.agg.n, avgMs: avgOfAgg(r.agg) };
}

/** The Query page. Params: q (the query shape, as the Database page lists it). */
export const queryPage: PageDef<QueryPageModel> = {
  needs: (ctx) => {
    const q = ctx.params.q ?? "";
    const keys = { filter: { keys: [q] } };
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("q", "db.q", "cur", { top: true, ids: true, hist: true, ...keys }),
      groupNeed("q.prev", "db.q", "prev", { hist: true, ...keys }),
      seriesNeed("chart", "db.q", "cur", CHART_BUCKETS, keys),
      seriesNeed("chart.prev", "db.q", "prev", CHART_BUCKETS, keys),
      groupNeed("svc", "db.q@svc", "cur", { filter: { parts: [null, q] } }),
      groupNeed("ep", "ep.q", "cur", { filter: { parts: [null, null, q] } }),
    ]);
  },
  followUp(_ctx, first) {
    const ids = rowsOf(first, "q")[0]?.agg.ids ?? [];
    return ids.length ? [listNeed("traces", "traces", "cur", { filter: { traceIds: ids }, limit: ids.length })] : [];
  },
  model(d) {
    const s = seriesOf(d, "chart", CHART_BUCKETS);
    return {
      meta: metaOf(d),
      query: d.params.q ?? "",
      slowMs: d.options.slowQueryMs,
      totals: totalsOf(totalOf(d, "q")),
      prev: totalsOf(totalOf(d, "q.prev")),
      slowest: (rowsOf(d, "q")[0]?.agg.top as QueryTop | undefined) ?? null,
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: { count: counts(s), avgMs: avgs(s), slow: counter(s, 0), prevCount: counts(seriesOf(d, "chart.prev", CHART_BUCKETS)) },
      services: [...rowsOf(d, "svc")].sort(byDesc((r) => r.agg.n)).map((r) => useOf(r, false)),
      endpoints: [...rowsOf(d, "ep")].sort(byDesc((r) => r.agg.n)).map((r) => useOf(r, true)),
      traces: listOf<TraceItem>(d, "traces").items,
    };
  },
};
