// Log metrics: lines that match a log search, counted per bucket, so a saved search becomes a chart.
import type { NeedResults, PageDef } from "../scale/needs.js";
import { bucketStarts, percentChange } from "../stats/common.js";
import { CHART_BUCKETS } from "./database.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { logFilterOf, logListFilterOf } from "./logs.js";
import { listNeed, listOf, type Series, uniqueNeeds } from "./read.js";

export interface LogChartModel {
  meta: ModelMeta;
  starts: number[];
  /** Matching lines per bucket, and those at error and up. */
  lines: Series;
  errors: Series;
  total: number;
  errorTotal: number;
  /** Percent change of the total against the window before; null without data before. */
  change: number | null;
}

const totalOf = (d: NeedResults, id: string): number => listOf(d, id).total ?? 0;

/** One log search as a chart. Params: the Logs page filter (level, exact, service, category, trace, q, pattern, origin). */
export const logChartPage: PageDef<LogChartModel> = {
  needs: (ctx) => {
    const filter = logListFilterOf(logFilterOf(ctx.params));
    return uniqueNeeds([
      ...META_NEEDS,
      listNeed("cur", "logs", "cur", { filter, limit: 0, count: true, aggregate: { buckets: CHART_BUCKETS } }),
      listNeed("prev", "logs", "prev", { filter, limit: 0, count: true }),
    ]);
  },
  model(d) {
    const series = listOf(d, "cur").aggregate?.series ?? [];
    const total = totalOf(d, "cur");
    const prev = totalOf(d, "prev");
    return {
      meta: metaOf(d),
      starts: bucketStarts(d.window, CHART_BUCKETS),
      lines: series.map((a) => a.n),
      errors: series.map((a) => a.err),
      total,
      errorTotal: listOf(d, "cur").aggregate?.total.err ?? 0,
      change: prev > 0 ? percentChange(total, prev) : null,
    };
  },
};
