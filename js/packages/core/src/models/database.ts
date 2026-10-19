import { type Agg, avgOfAgg } from "../scale/agg.js";
import type { QueryTop } from "../scale/facts-db.js";
import { splitKey } from "../scale/kinds.js";
import type { PageData, PageDef } from "../scale/needs.js";
import { bucketStarts, percentChange } from "../stats/common.js";
import { type DbSummary, OPERATIONS, type OperationRow, type QueryRow, type TableRow } from "../stats/database.js";
import type { InsightGroup } from "../stats/insights.js";
import { SPARK_BUCKETS } from "../stats/overview.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
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
  queries: QueryRow[];
  queryShapes: number;
  tables: TableRow[];
  /** Tables before the list limit. */
  tableCount: number;
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

function queriesOf(d: PageData): QueryRow[] {
  const endpoints = endpointsByQuery(rowsOf(d, "db.qe"));
  return [...rowsOf(d, "db.q")].sort(byDesc((r) => avgOfAgg(r.agg) ?? 0)).map(({ key, agg }) => {
    const top = agg.top as QueryTop;
    const slow = agg.c[0] ?? 0;
    const base = { key, query: key, count: agg.n, avgMs: agg.sum / agg.n, maxMs: top.durationMs, totalMs: agg.sum, slow, errors: agg.err };
    return { ...base, endpoints: endpoints.get(key) ?? [], system: top.system, exampleTraceId: top.traceId };
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

const LIST = { order: { by: "n", desc: true, limit: MODEL_LIST_MAX } } as const;

/** The Database page. */
export const databasePage: PageDef<DatabaseModel> = {
  needs: () =>
    uniqueNeeds([
      ...META_NEEDS,
      groupNeed("db.cur", "db", "cur"),
      groupNeed("db.prev", "db", "prev"),
      ...insightNeeds("cur", "requests"),
      ...insightNeeds("prev", "requests"),
      groupNeed("db.q", "db.q", "cur", { top: true, order: { by: "avg", desc: true, limit: MODEL_LIST_MAX } }),
      groupNeed("db.qe", "db.qe", "cur"),
      groupNeed("db.t", "db.t", "cur", LIST),
      groupNeed("db.op", "db.op", "cur"),
      seriesNeed("chart", "db", "cur", CHART_BUCKETS),
      seriesNeed("sparks", "db", "cur", SPARK_BUCKETS),
    ]),
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
      tables: tablesOf(d),
      tableCount: groupCount(d, "db.t"),
      operations: operationsOf(d),
      starts: bucketStarts(d.window, CHART_BUCKETS),
      chart: chartOf(seriesOf(d, "chart", CHART_BUCKETS)),
      change: changeOf(d, summary, insights.length),
      sparks: { queries: spark.total, avgMs: spark.avg, slow: spark.slow },
    };
  },
};
