import { bucketStarts, percentOf, series } from "../../stats/common.js";
import { serviceEdges, serviceRows, type ServiceEdge, type ServiceRow } from "../../stats/services.js";
import type { Trace } from "../../types.js";
import { type ModelInput, type ModelMeta, metaOf } from "./input.js";
import { edgesOf, endpointsOf, type EndpointStat, failedSpan, findRow, spansOfRow } from "./service-detail.js";

const BUCKETS = 24;

type Series = (number | null)[];

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

function detail(traces: readonly Trace[], row: ServiceRow, edges: readonly ServiceEdge[], i: ModelInput): ServiceDetailModel {
  const spans = spansOfRow(traces, row);
  return {
    row,
    endpoints: endpointsOf(spans, row),
    starts: bucketStarts(i.window, BUCKETS),
    traffic: series(spans, (s) => s.startMs, i.window, BUCKETS),
    ...edgesOf(edges, row.name),
  };
}

/** The Services page. Params: service (the selected row's key or name). */
export function servicesModel(i: ModelInput): ServicesModel {
  const rows = serviceRows(i.traces);
  const edges = serviceEdges(i.traces);
  const servers = i.traces.flatMap((t) => t.spans.filter((s) => s.category === "http.server"));
  const selected = findRow(rows, i.params.service ?? null);
  return {
    meta: metaOf(i),
    rows,
    edges,
    summary: summarizeServices(rows),
    prevSummary: summarizeServices(serviceRows(i.prevTraces)),
    served: series(servers, (s) => s.startMs, i.window, BUCKETS),
    failed: series(servers.filter(failedSpan), (s) => s.startMs, i.window, BUCKETS),
    selected: selected ? detail(i.traces, selected, edges, i) : null,
  };
}
