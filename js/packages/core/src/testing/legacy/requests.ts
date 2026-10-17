import { requestHeadlines, type RequestHeadlines } from "../../stats/overview.js";
import type { RequestRow } from "../../stats/requests.js";
import { type ModelInput, type ModelMeta, metaOf, pageOf } from "./input.js";
import { applyFilter, filterFromQuery, isFiltered, isSortKey, optionsOf, sortRows } from "./request-filter.js";

export interface RequestsModel {
  meta: ModelMeta;
  headlines: RequestHeadlines;
  options: { methods: string[]; services: string[] };
  filtered: boolean;
  /** The rows of this page, after filter and sort. */
  rows: RequestRow[];
  total: number;
  page: number;
  pageSize: number;
  /** The `trace` parameter's request, when it is in the range. */
  selected: RequestRow | null;
}

/** The Requests page. Params: method, status, duration, service, q, sort, desc, page, size, trace. */
export function requestsModel(i: ModelInput): RequestsModel {
  const filter = filterFromQuery(i.params);
  const rows = applyFilter(i.requests, filter);
  const sort = { key: isSortKey(i.params.sort) ? i.params.sort : "time", desc: i.params.desc !== "0" } as const;
  const paged = pageOf(sortRows(rows, sort), i.params, 15);
  const id = i.params.trace;
  return {
    meta: metaOf(i),
    headlines: requestHeadlines(rows, applyFilter(i.prevRequests, filter), i.window),
    options: optionsOf(i.requests),
    filtered: isFiltered(filter),
    rows: paged.items,
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
    selected: id ? (i.requests.find((r) => r.traceId === id) ?? null) : null,
  };
}
