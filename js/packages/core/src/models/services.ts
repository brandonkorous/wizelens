import type { PageData, PageDef } from "../scale/needs.js";
import { bucketStarts, percentOf } from "../stats/common.js";
import type { ServiceEdge, ServiceRow } from "../stats/services.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { byDesc, counts, rowsOf, type Series, seriesNeed, seriesOf, uniqueNeeds } from "./read.js";
import { edgesOf, endpointPrefix, type EndpointStat, endpointStatsOf, findRow } from "./service-detail.js";
import { edgeNeeds, edgesOfRows, serviceNeeds, serviceRowsOf } from "./service-rows.js";

const BUCKETS = 24;
const TOP_ENDPOINTS = 10;

export interface ServicesSummary {
  apis: number;
  databases: number;
  served: number;
  errorRate: number | null;
}

export interface ServiceDetailModel {
  row: ServiceRow;
  endpoints: EndpointStat[];
  starts: number[];
  traffic: Series;
  incoming: ServiceEdge[];
  outgoing: ServiceEdge[];
}

export interface ServicesModel {
  meta: ModelMeta;
  rows: ServiceRow[];
  edges: ServiceEdge[];
  summary: ServicesSummary;
  prevSummary: ServicesSummary;
  served: Series;
  failed: Series;
  selected: ServiceDetailModel | null;
}

export function summarizeServices(rows: readonly ServiceRow[]): ServicesSummary {
  const apis = rows.filter((r) => r.kind === "api");
  const served = apis.reduce((t, r) => t + r.requests, 0);
  const errors = apis.reduce((t, r) => t + r.errors, 0);
  return { apis: apis.length, databases: rows.filter((r) => r.kind === "database").length, served, errorRate: served ? percentOf(errors, served) : null };
}

function detail(d: PageData, row: ServiceRow, edges: readonly ServiceEdge[]): ServiceDetailModel {
  const endpoints = [...rowsOf(d, "svc.ep")].sort(byDesc((r) => r.agg.n));
  return {
    row,
    endpoints: endpointStatsOf(endpoints, row.key),
    starts: bucketStarts(d.window, BUCKETS),
    traffic: counts(seriesOf(d, "traffic", BUCKETS)),
    ...edgesOf(edges, row.name),
  };
}

/** The Services page. Params: service (the selected row's key or name). */
export const servicesPage: PageDef<ServicesModel> = {
  needs: () => uniqueNeeds([...META_NEEDS, ...serviceNeeds("cur"), ...serviceNeeds("prev"), ...edgeNeeds(), seriesNeed("served", "svc", "cur", BUCKETS, { filter: { prefix: "api:" } })]),
  followUp(ctx, first) {
    const row = findRow(serviceRowsOf(first, "cur"), ctx.params.service ?? null);
    if (!row) return [];
    const order = { by: "n", desc: true, limit: TOP_ENDPOINTS } as const;
    return [
      { type: "groups", id: "svc.ep", kind: "svc.ep", window: "cur", filter: { prefix: endpointPrefix(row.key) }, order },
      seriesNeed("traffic", "svc", "cur", BUCKETS, { filter: { keys: [row.key] } }),
    ];
  },
  model(d) {
    const rows = serviceRowsOf(d, "cur");
    const edges = edgesOfRows(d);
    const selected = findRow(rows, d.params.service ?? null);
    const served = seriesOf(d, "served", BUCKETS);
    return {
      meta: metaOf(d),
      rows,
      edges,
      summary: summarizeServices(rows),
      prevSummary: summarizeServices(serviceRowsOf(d, "prev")),
      served: counts(served),
      failed: served.map((a) => a.err),
      selected: selected ? detail(d, selected, edges) : null,
    };
  },
};
