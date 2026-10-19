import type { RequestItem } from "../scale/facts-lists.js";
import { splitKey } from "../scale/kinds.js";
import { displayService, rawService } from "../stats/errors.js";
import type { KeyFilter, ListFilter, Need, PageData, PageDef } from "../scale/needs.js";
import { SPARK_BUCKETS, type RequestHeadlines } from "../stats/overview.js";
import { headlineNeeds, headlinesFrom, headlinesOf } from "./headlines.js";
import { META_NEEDS, type ModelMeta, type ModelParams, metaOf, pageParams } from "./input.js";
import { groupNeed, listNeed, listOf, rowsOf, uniqueNeeds } from "./read.js";
import { DURATION_OPTIONS, filterFromQuery, isFiltered, isSortKey, type RequestFilter } from "./request-filter.js";

export interface RequestsModel {
  meta: ModelMeta;
  headlines: RequestHeadlines;
  options: { methods: string[]; services: string[] };
  filtered: boolean;
  /** The rows of this page, after filter and sort. */
  rows: RequestItem[];
  total: number;
  page: number;
  pageSize: number;
  /** The `trace` parameter's request, when it is in the range. */
  selected: RequestItem | null;
}

const DURATION_KEYS = new Set(DURATION_OPTIONS.map(([k]) => k).filter(Boolean));

/** The filter as list filters, leaving out empty values and unknown durations (which filter nothing). */
export function requestListFilter(f: RequestFilter): ListFilter {
  const out: ListFilter = {};
  for (const k of ["method", "status", "q", "endpoint", "user"] as const) if (f[k]) out[k] = f[k];
  if (f.service) out.service = rawService(f.service);
  if (f.insights) out.insights = true;
  if (DURATION_KEYS.has(f.duration)) out.duration = f.duration;
  return out;
}

/** The filter as key parts of `req.dim` (method, status class, failed, duration), or of `req.svc` with the service first. */
export function requestKeyFilter(f: RequestFilter): KeyFilter | undefined {
  const status = f.status === "failed" ? null : f.status || null;
  const parts = [f.method || null, status, f.status === "failed" ? "1" : null, DURATION_KEYS.has(f.duration) ? f.duration : null];
  const all = f.service ? [rawService(f.service), ...parts] : parts;
  return all.some((p) => p !== null) ? { parts: all } : undefined;
}

const sortOf = (p: ModelParams) => ({ key: isSortKey(p.sort) ? p.sort : "time", desc: p.desc !== "0" });

function needs(p: ModelParams): Need[] {
  const f = filterFromQuery(p);
  const filter = requestListFilter(f);
  // Text, endpoint, user, and insights are not rollup keys: headlines then come from the matching rows.
  const q = f.q.trim() !== "" || !!(f.endpoint || f.user || f.insights);
  const out: Need[] = [
    ...META_NEEDS,
    listNeed("rows", "requests", "cur", { filter, sort: sortOf(p), page: pageParams(p, 15), ...(q ? { aggregate: { buckets: SPARK_BUCKETS } } : {}) }),
    groupNeed("opt.dim", "req.dim", "cur"),
    groupNeed("opt.svc", "req.svc", "cur"),
  ];
  if (q) out.push(listNeed("prev", "requests", "prev", { filter, limit: 0, aggregate: { buckets: SPARK_BUCKETS } }));
  else out.push(...headlineNeeds("h", f.service ? "req.svc" : "req.dim", requestKeyFilter(f)));
  if (p.trace) out.push(listNeed("selected", "requests", "cur", { filter: { traceId: p.trace }, limit: 1 }));
  return uniqueNeeds(out);
}

function headlinesOfPage(d: PageData): RequestHeadlines {
  const cur = listOf(d, "rows").aggregate;
  const prev = listOf(d, "prev").aggregate;
  if (!cur || !prev) return headlinesFrom(d, "h");
  return headlinesOf(cur.total, prev.total, cur.series);
}

const distinct = (values: readonly string[]): string[] => [...new Set(values)].sort();

/** The Requests page. Params: method, status, duration, service (a display name), q, endpoint, user, insights, sort, desc, page, size, trace. */
export const requestsPage: PageDef<RequestsModel> = {
  needs: (ctx) => needs(ctx.params),
  model(d) {
    const list = listOf<RequestItem>(d, "rows");
    const services = rowsOf(d, "opt.svc").filter((r) => (r.agg.c[2] ?? 0) > 0);
    return {
      meta: metaOf(d),
      headlines: headlinesOfPage(d),
      options: { methods: distinct(rowsOf(d, "opt.dim").map((r) => splitKey(r.key)[0]!)), services: distinct(services.map((r) => displayService(splitKey(r.key)[0]!))) },
      filtered: isFiltered(filterFromQuery(d.params)),
      rows: list.items,
      total: list.total ?? list.items.length,
      page: list.page,
      pageSize: list.pageSize,
      selected: d.params.trace ? (listOf<RequestItem>(d, "selected").items[0] ?? null) : null,
    };
  },
};
