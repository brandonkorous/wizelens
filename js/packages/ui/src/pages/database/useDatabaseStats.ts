import { useMemo } from "react";
import {
  bucketStarts,
  dbCalls,
  dbSummary,
  insightGroups,
  operationRows,
  percentChange,
  queryRows,
  series,
  tableRows,
} from "@wizeworks/lens-core";
import { useData, useWindowed } from "../../data/hooks";

export const CHART_BUCKETS = 48;
export const SPARK_BUCKETS = 24;
const DEFAULT_SLOW_QUERY_MS = 100;

/** Everything the Database page shows, for the selected time range. */
export function useDatabaseStats() {
  const w = useWindowed();
  const info = useData().info;
  const slowMs = info?.analysis?.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS;
  return useMemo(() => {
    const calls = dbCalls(w.traces);
    const prevCalls = dbCalls(w.prevTraces);
    const summary = dbSummary(calls, slowMs);
    const prev = dbSummary(prevCalls, slowMs);
    const insights = insightGroups(w.traces).filter((g) => g.area === "database");
    const prevInsights = insightGroups(w.prevTraces).filter((g) => g.area === "database").length;
    const hasPrev = prevCalls.length > 0;
    const spark = (agg: "count" | "avg", value?: (c: (typeof calls)[number]) => number, list = calls) =>
      series(list, (c) => c.startMs, w.window, SPARK_BUCKETS, agg, value);
    return {
      w,
      slowMs,
      calls,
      summary,
      insights,
      queries: queryRows(calls, slowMs),
      tables: tableRows(calls),
      operations: operationRows(calls),
      starts: bucketStarts(w.window, CHART_BUCKETS),
      change: {
        queries: hasPrev ? percentChange(summary.queries, prev.queries) : null,
        avgMs: percentChange(summary.avgMs, prev.avgMs),
        slow: hasPrev ? percentChange(summary.slow, prev.slow) : null,
        insights: hasPrev ? percentChange(insights.length, prevInsights) : null,
      },
      sparks: {
        queries: spark("count"),
        avgMs: spark("avg", (c) => c.durationMs),
        slow: spark("count", undefined, calls.filter((c) => c.durationMs >= slowMs)),
      },
    };
  }, [w, slowMs]);
}

export type DatabaseStats = ReturnType<typeof useDatabaseStats>;
