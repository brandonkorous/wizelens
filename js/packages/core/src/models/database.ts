import { type Agg, avgOfAgg } from "../scale/agg.js";
import type { QueryTop } from "../scale/facts-db.js";
import { splitKey } from "../scale/kinds.js";
import type { PageData, PageDef } from "../scale/needs.js";
import { bucketStarts, percentChange } from "../stats/common.js";
import { type DbSummary, OPERATIONS, type OperationRow, type QueryRow, type TableRow } from "../stats/database.js";
import type { InsightGroup } from "../stats/insights.js";
import { SPARK_BUCKETS } from "../stats/overview.js";
import { type QueryFilter, queryFilterOf, queryListNeed, queryOfKey, QUERY_PAGE_SIZE } from "./database-filter.js";
import { META_NEEDS, type ModelMeta, type ModelParams, metaOf, pageParams, scoped } from "./input.js";
import { groupPage, type PageInfo } from "./paged.js";
import { insightGroupsOf, insightNeeds } from "./insight-groups.js";
import { aggByKey, avgs, byDesc, counter, counts, groupCount, groupNeed, type Row, rowsOf, type Series, seriesNeed, seriesOf, totalOf, uniqueNeeds } from "./read.js";

export const CHART_BUCKETS = 48;
/** Longest lists a model sends. The page shows the top rows and can expand to these. */
export const MODEL_LIST_MAX = 200;

export interface DatabaseModel {
  meta: ModelMeta;
  slowMs: number;
  summary: DbSummary;
  insights: InsightGroup[];
  /** One page of the query shapes that match the filter. */
  queries: QueryRow[];
  /** Query shapes that match the filter, on every page. */
  queryShapes: number;
  filter: QueryFilter;
  page: number;
  size: number;
  /** Databases, as the Services page names them, for the database filter. */
  databases: string[];
  /** One page of the tables (URL key "tbl"), most queries first or in the `tblsort` column's order. */
  tables: TableRow[];
  tableCount: number;
  tablePaging: PageInfo;
  operations: OperationRow[];
  starts: number[];
  chart: { total: Series; slow: Series; avg: Series };
  change: { queries: number | null; avgMs: number | null; slow: number | null; insights: number | null };
  sparks: { queries: Series; avgMs: Series; slow: Series };
}

const summaryOf = (a: Agg): DbSummary => ({ queries: a.n, avgMs: avgOfAgg(a), slow: a.c[0] ?? 0, totalMs: a.sum });

const chartOf = (s: readonly Agg[]) => ({ total: counts(s), slow: counter(s, 0), avg: avgs(s) });

/** Endpoints per query shape, most calls first. */
function endpointsByQuery(rows: readonly Row[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { key } of [...rows].sort(byDesc((r) => r.agg.n))) {
    const [query = "", endpoint = ""] = splitKey(key);
    out.set(query, [...(out.get(query) ?? []), endpoint]);
  }
  return out;
}

/** One page of query shapes, in the filter's order (the executor's). */
function queriesOf(d: PageData): QueryRow[] {
  const endpoints = endpointsByQuery(rowsOf(d, "db.qe"));
  return rowsOf(d, "db.q").map(({ key, agg }) => {
    const top = agg.top as QueryTop;
    const query = queryOfKey(key);
    const base = { key, query, count: agg.n, avgMs: agg.sum / agg.n, maxMs: top.durationMs, totalMs: agg.sum, slow: agg.c[0] ?? 0, errors: agg.err };
    return { ...base, endpoints: endpoints.get(query) ?? [], system: top.system, exampleTraceId: top.traceId };
  });
}

function tablesOf(d: PageData): TableRow[] {
  return rowsOf(d, "db.t").map(({ key, agg }) => ({ table: key, queries: agg.n, avgMs: agg.sum / agg.n, totalMs: agg.sum, rows: (agg.c[0] ?? 0) > 0 ? (agg.c[1] ?? 0) : null }));
}

function operationsOf(d: PageData): OperationRow[] {
  const ops = aggByKey(d, "db.op");
  return OPERATIONS.map((operation) => {
    const a = ops.get(operation);
    return { operation, count: a?.n ?? 0, avgMs: a ? avgOfAgg(a) : null, totalMs: a?.sum ?? 0 };
  });
}

function changeOf(d: PageData, summary: DbSummary, insights: number): DatabaseModel["change"] {
  const prev = summaryOf(totalOf(d, "db.prev"));
  const hasPrev = prev.queries > 0;
  const prevInsights = insightGroupsOf(d, "prev", "requests").filter((g) => g.area === "database").length;
  return {
    queries: hasPrev ? percentChange(summary.queries, prev.queries) : null,
    avgMs: percentChange(summary.avgMs, prev.avgMs),
    slow: hasPrev ? percentChange(summary.slow, prev.slow) : null,
    insights: hasPrev ? percentChange(insights, prevInsights) : null,
  };
}

/** Tables a page of hotspots shows at first. */
export const TABLE_PAGE_SIZE = 5;

/** Columns the hotspots sort by (tblsort=-avg): the group orders behind them. */
const TABLE_ORDERS = { queries: "n", avg: "avg", rows: "c1" } as const;

const tablePage = (p: ModelParams) => groupPage(p, "tbl", TABLE_PAGE_SIZE, TABLE_ORDERS, { key: "queries", desc: true });

/** The Database page. Params: the filter (`queryFilterOf`), page, and size; tblpage, tblsize, and tblsort for the table hotspots. */
export const databasePage: PageDef<DatabaseModel> = {
  needs: (ctx) => {
    const f = queryFilterOf(ctx.params);
    const service = f.service || undefined;
    const one = scoped(service);
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("db.cur", "db", "cur", one),
      groupNeed("db.prev", "db", "prev", one),
      ...insightNeeds("cur", "requests", service),
      ...insightNeeds("prev", "requests", service),
      queryListNeed(f, ctx.params),
      groupNeed("db.qe", "db.qe", "cur", one),
      groupNeed("db.t", "db.t", "cur", { order: tablePage(ctx.params).order, ...one }),
      groupNeed("db.op", "db.op", "cur", one),
      groupNeed("dbs", "svc", "cur", { filter: { prefix: "db:" } }),
      seriesNeed("chart", "db", "cur", CHART_BUCKETS, one),
      seriesNeed("sparks", "db", "cur", SPARK_BUCKETS, one),
    ]);
  },
  model(d) {
    const summary = summaryOf(totalOf(d, "db.cur"));
    const insights = insightGroupsOf(d, "cur", "requests").filter((g) => g.area === "database");
    const spark = chartOf(seriesOf(d, "sparks", SPARK_BUCKETS));
    return {
      meta: metaOf(d),
      slowMs: d.options.slowQueryMs,
      summary,
      insights,
      queries: queriesOf(d),
      queryShapes: groupCount(d, "db.q"),
      filter: queryFilterOf(d.params),
      ...pageParams(d.params, QUERY_PAGE_SIZE),
      databases: rowsOf(d, "dbs").map((r) => r.key.slice(3)).sort(),
      tables: tablesOf(d),
      tableCount: groupCount(d, "db.t"),
      tablePaging: tablePage(d.params).paging(groupCount(d, "db.t")),
      operations: operationsOf(d),
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: chartOf(seriesOf(d, "chart", CHART_BUCKETS)),
      change: changeOf(d, summary, insights.length),
      sparks: { queries: spark.total, avgMs: spark.avg, slow: spark.slow },
    };
  },
};
