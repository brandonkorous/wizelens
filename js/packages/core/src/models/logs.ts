import { bucketStarts, percentChange, series, type TimeWindow } from "../stats/common.js";
import { filterLogs, type LogFilter, levelCounts, LOG_LEVELS, type LogRow, logRows } from "../stats/logs.js";
import type { LogLevel } from "../types.js";
import { SPARK_BUCKETS } from "../stats/overview.js";
import { CHART_BUCKETS } from "./database.js";
import { type ModelInput, type ModelMeta, metaOf, pageOf } from "./input.js";

type Series = (number | null)[];

/** Levels shown as one color in the volume chart. */
export const VOLUME_GROUPS: { key: string; label: string; levels: LogLevel[] }[] = [
  { key: "info", label: "Info and below", levels: ["trace", "debug", "info"] },
  { key: "warn", label: "Warnings", levels: ["warn"] },
  { key: "error", label: "Errors", levels: ["error", "critical"] },
];

export interface LogsModel {
  meta: ModelMeta;
  filter: LogFilter;
  /** Every line in the range, before the filter. */
  totalLines: number;
  services: string[];
  rows: LogRow[];
  matching: number;
  page: number;
  pageSize: number;
  starts: number[];
  volume: Record<string, Series>;
  cards: { total: number; warnings: number; errors: number; critical: number };
  change: { total: number | null; warnings: number | null; errors: number | null; critical: number | null };
  sparks: { total: Series; warnings: Series; errors: Series; critical: Series };
}

const isLevel = (v: string | undefined): v is LogLevel => !!v && (LOG_LEVELS as readonly string[]).includes(v);

export const logFilterOf = (p: ModelInput["params"]): LogFilter => ({ minLevel: isLevel(p.level) ? p.level : "trace", service: p.service ?? "", query: p.q ?? "" });

const levelSeries = (rows: readonly LogRow[], levels: LogLevel[], w: TimeWindow, buckets: number) =>
  series(rows.filter((r) => levels.includes(r.level)), (r) => r.timeMs, w, buckets);

/** The Logs page. Params: level, service, q, page, size. */
export function logsModel(i: ModelInput): LogsModel {
  const all = logRows(i.traces);
  const prev = logRows(i.prevTraces);
  const filter = logFilterOf(i.params);
  const paged = pageOf(filterLogs(all, filter), i.params, 30);
  const counts = levelCounts(all);
  const prevCounts = levelCounts(prev);
  const hasPrev = prev.length > 0;
  const errors = counts.error + counts.critical;
  const spark = (levels: LogLevel[]) => levelSeries(all, levels, i.window, SPARK_BUCKETS);
  return {
    meta: metaOf(i),
    filter,
    totalLines: all.length,
    services: [...new Set(all.map((r) => r.service))].sort(),
    rows: paged.items,
    matching: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
    starts: bucketStarts(i.window, CHART_BUCKETS),
    volume: Object.fromEntries(VOLUME_GROUPS.map((g) => [g.key, levelSeries(all, g.levels, i.window, CHART_BUCKETS)])),
    cards: { total: all.length, warnings: counts.warn, errors, critical: counts.critical },
    change: {
      total: hasPrev ? percentChange(all.length, prev.length) : null,
      warnings: hasPrev ? percentChange(counts.warn, prevCounts.warn) : null,
      errors: hasPrev ? percentChange(errors, prevCounts.error + prevCounts.critical) : null,
      critical: hasPrev ? percentChange(counts.critical, prevCounts.critical) : null,
    },
    sparks: { total: spark([...LOG_LEVELS]), warnings: spark(["warn"]), errors: spark(["error", "critical"]), critical: spark(["critical"]) },
  };
}
