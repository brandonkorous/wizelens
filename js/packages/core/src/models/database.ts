import { bucketStarts, percentChange, series } from "../stats/common.js";
import { type DbCall, dbCalls, dbSummary, type DbSummary, operationRows, type OperationRow, queryRows, type QueryRow, tableRows, type TableRow } from "../stats/database.js";
import { insightGroups, type InsightGroup } from "../stats/insights.js";
import { SPARK_BUCKETS } from "../stats/overview.js";
import { type ModelInput, type ModelMeta, metaOf } from "./input.js";

export const CHART_BUCKETS = 48;
/** Longest lists a model sends. The page shows the top rows and can expand to these. */
export const MODEL_LIST_MAX = 200;

type Series = (number | null)[];

export interface DatabaseModel {
  meta: ModelMeta;
  slowMs: number;
  summary: DbSummary;
  insights: InsightGroup[];
  queries: QueryRow[];
  queryShapes: number;
  tables: TableRow[];
  operations: OperationRow[];
  starts: number[];
  chart: { total: Series; slow: Series; avg: Series };
  change: { queries: number | null; avgMs: number | null; slow: number | null; insights: number | null };
  sparks: { queries: Series; avgMs: Series; slow: Series };
}

function charts(calls: readonly DbCall[], i: ModelInput, slowMs: number, buckets: number) {
  const slow = calls.filter((c) => c.durationMs >= slowMs);
  return {
    total: series(calls, (c) => c.startMs, i.window, buckets),
    slow: series(slow, (c) => c.startMs, i.window, buckets),
    avg: series(calls, (c) => c.startMs, i.window, buckets, "avg", (c) => c.durationMs),
  };
}

/** The Database page. */
export function databaseModel(i: ModelInput): DatabaseModel {
  const slowMs = i.options.slowQueryMs;
  const calls = dbCalls(i.traces);
  const prevCalls = dbCalls(i.prevTraces);
  const summary = dbSummary(calls, slowMs);
  const prev = dbSummary(prevCalls, slowMs);
  const insights = insightGroups(i.traces).filter((g) => g.area === "database");
  const prevInsights = insightGroups(i.prevTraces).filter((g) => g.area === "database").length;
  const hasPrev = prevCalls.length > 0;
  const queries = queryRows(calls, slowMs);
  const spark = charts(calls, i, slowMs, SPARK_BUCKETS);
  return {
    meta: metaOf(i),
    slowMs,
    summary,
    insights,
    queries: queries.slice(0, MODEL_LIST_MAX),
    queryShapes: queries.length,
    tables: tableRows(calls).slice(0, MODEL_LIST_MAX),
    operations: operationRows(calls),
    starts: bucketStarts(i.window, CHART_BUCKETS),
    chart: charts(calls, i, slowMs, CHART_BUCKETS),
    change: {
      queries: hasPrev ? percentChange(summary.queries, prev.queries) : null,
      avgMs: percentChange(summary.avgMs, prev.avgMs),
      slow: hasPrev ? percentChange(summary.slow, prev.slow) : null,
      insights: hasPrev ? percentChange(insights.length, prevInsights) : null,
    },
    sparks: { queries: spark.total, avgMs: spark.avg, slow: spark.slow },
  };
}
