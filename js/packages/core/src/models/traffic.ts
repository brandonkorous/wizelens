// Exact traffic for agents (MCP get_timeseries and group_requests): requests, errors, and latency per bucket, and per endpoint.
import { type Agg, avgOfAgg } from "../scale/agg.js";
import { histPercentile } from "../scale/hist.js";
import { joinKey } from "../scale/kinds.js";
import type { BucketCount, Need, NeedResults, PageDef } from "../scale/needs.js";
import { bucketStarts, percentOf } from "../stats/common.js";
import type { ServiceKind, ServiceRow } from "../stats/services.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { groupNeed, rowsOf, seriesNeed, seriesOf, sumAggs, uniqueNeeds } from "./read.js";
import { endpointPrefix, findRow } from "./service-detail.js";
import { serviceNeeds, serviceRowsOf } from "./service-rows.js";

export const TRAFFIC_BUCKETS: readonly BucketCount[] = [16, 24, 48];
/** Services whose endpoints are read, busiest first, and endpoints per service. */
const MAX_SERVICES = 100;
const PER_SERVICE = 200;
const ENDPOINT_KINDS: ReadonlySet<ServiceKind> = new Set(["api", "web"]);

/** Requests, errors, and latency of one bucket or one endpoint. */
export interface TrafficStats {
  requests: number;
  errors: number;
  errorRatePercent: number;
  avgMs: number | null;
  p95Ms: number | null;
}

export interface TrafficEndpoint extends TrafficStats {
  service: string;
  kind: ServiceKind;
  endpoint: string;
}

export interface TrafficModel {
  meta: ModelMeta;
  /** What the series counts: every request, one service, or one endpoint. `found` is false for a service that did nothing in the window. */
  scope: { service: string | null; endpoint: string | null; found: boolean };
  bucketMs: number;
  points: (TrafficStats & { start: number })[];
  totals: TrafficStats;
  /** Endpoints of the services in scope, busiest first. */
  endpoints: TrafficEndpoint[];
}

const bucketsOf = (p: Readonly<Record<string, string>>): BucketCount => TRAFFIC_BUCKETS.find((b) => String(b) === p.buckets) ?? 24;

export const statsOf = (a: Agg): TrafficStats => ({
  requests: a.n,
  errors: a.err,
  errorRatePercent: percentOf(a.err, a.n),
  avgMs: avgOfAgg(a),
  p95Ms: a.hist && a.n ? histPercentile(a.hist, a.n, 95) : null,
});

/** The series: every request (`req`), one service (`svc`), or one endpoint (`svc.ep`, of one service or all). */
function seriesNeedOf(row: ServiceRow | null, endpoint: string, buckets: BucketCount): Need {
  if (endpoint) return seriesNeed("ts", "svc.ep", "cur", buckets, { filter: row ? { keys: [joinKey(row.key, endpoint)] } : { parts: [null, endpoint] }, hist: true });
  if (row) return seriesNeed("ts", "svc", "cur", buckets, { filter: { keys: [row.key] }, hist: true });
  return seriesNeed("ts", "req", "cur", buckets, { hist: true });
}

const endpointRows = (rows: readonly ServiceRow[], row: ServiceRow | null) => (row ? [row] : rows.filter((r) => ENDPOINT_KINDS.has(r.kind)).slice(0, MAX_SERVICES));

function endpointsOf(d: NeedResults, rows: readonly ServiceRow[], endpoint: string): TrafficEndpoint[] {
  const out = rows.flatMap((r, i) =>
    rowsOf(d, `ep.${i}`).map(({ key, agg }) => ({ service: r.name, kind: r.kind, endpoint: key.slice(endpointPrefix(r.key).length), ...statsOf(agg) })),
  );
  return out.filter((e) => !endpoint || e.endpoint === endpoint).sort((a, b) => b.requests - a.requests || a.endpoint.localeCompare(b.endpoint));
}

/** Params: service (a Services row key or name), endpoint (as `GET /orders/{id}`), buckets (16, 24, or 48), from and to. */
export const trafficPage: PageDef<TrafficModel> = {
  needs: () => uniqueNeeds([...META_NEEDS, ...serviceNeeds("cur")]),
  followUp(ctx, first) {
    const rows = serviceRowsOf(first, "cur");
    const row = findRow(rows, ctx.params.service ?? null);
    if (ctx.params.service && !row) return [];
    const eps = endpointRows(rows, row).map((r, i) => groupNeed(`ep.${i}`, "svc.ep", "cur", { filter: { prefix: endpointPrefix(r.key) }, hist: true, order: { by: "n", desc: true, limit: PER_SERVICE } }));
    return [seriesNeedOf(row, ctx.params.endpoint ?? "", bucketsOf(ctx.params)), ...eps];
  },
  model(d) {
    const buckets = bucketsOf(d.params);
    const rows = serviceRowsOf(d, "cur");
    const row = findRow(rows, d.params.service ?? null);
    const found = !d.params.service || !!row;
    const series = found ? seriesOf(d, "ts", buckets) : [];
    const starts = bucketStarts(d.window, buckets);
    return {
      meta: metaOf(d),
      scope: { service: row?.name ?? d.params.service ?? null, endpoint: d.params.endpoint || null, found },
      bucketMs: (d.window.to - d.window.from) / buckets,
      points: series.map((a, i) => ({ start: starts[i]!, ...statsOf(a) })),
      totals: statsOf(sumAggs(series)),
      endpoints: found ? endpointsOf(d, endpointRows(rows, row), d.params.endpoint ?? "") : [],
    };
  },
};
