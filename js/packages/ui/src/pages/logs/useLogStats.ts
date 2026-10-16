import { useMemo } from "react";
import { bucketStarts, filterLogs, levelCounts, type LogLevel, LOG_LEVELS, logRows, percentChange, series } from "@wizeworks/lens-core";
import { useWindowed } from "../../data/hooks";
import { useRoute } from "../../routes";

export const CHART_BUCKETS = 48;
export const SPARK_BUCKETS = 24;

const isLevel = (v: string | null): v is LogLevel => v !== null && (LOG_LEVELS as readonly string[]).includes(v);

/** Filters live in the URL, so a filtered view can be shared or reloaded. */
export function useLogFilter() {
  const q = useRoute().query;
  const level = q.get("level");
  return {
    minLevel: isLevel(level) ? level : ("trace" as LogLevel),
    service: q.get("service") ?? "",
    query: q.get("q") ?? "",
    page: Math.max(1, Number(q.get("page")) || 1),
    pageSize: Number(q.get("size")) || 30,
  };
}

/** Log lines of the selected time range, filtered, with counts and charts. */
export function useLogStats() {
  const w = useWindowed();
  const filter = useLogFilter();
  return useMemo(() => {
    const all = logRows(w.traces);
    const prev = logRows(w.prevTraces);
    const rows = filterLogs(all, filter);
    const counts = levelCounts(all);
    const prevCounts = levelCounts(prev);
    const hasPrev = prev.length > 0;
    const errors = counts.error + counts.critical;
    const spark = (levels: LogLevel[]) => series(all.filter((r) => levels.includes(r.level)), (r) => r.timeMs, w.window, SPARK_BUCKETS);
    return {
      w,
      filter,
      all,
      rows,
      counts,
      services: [...new Set(all.map((r) => r.service))].sort(),
      starts: bucketStarts(w.window, CHART_BUCKETS),
      cards: { total: all.length, warnings: counts.warn, errors, critical: counts.critical },
      change: {
        total: hasPrev ? percentChange(all.length, prev.length) : null,
        warnings: hasPrev ? percentChange(counts.warn, prevCounts.warn) : null,
        errors: hasPrev ? percentChange(errors, prevCounts.error + prevCounts.critical) : null,
        critical: hasPrev ? percentChange(counts.critical, prevCounts.critical) : null,
      },
      sparks: { total: spark([...LOG_LEVELS]), warnings: spark(["warn"]), errors: spark(["error", "critical"]), critical: spark(["critical"]) },
    };
  }, [w, filter.minLevel, filter.service, filter.query, filter.page, filter.pageSize]);
}

export type LogStats = ReturnType<typeof useLogStats>;
