// The Uptime page's numbers: runs, failures, and response time per check, from the up (all checks) and up.chk (by check id) rollups.
import { avgOfAgg } from "../scale/agg.js";
import type { KeyFilter, NeedResults, PageDef } from "../scale/needs.js";
import { bucketStarts } from "../stats/common.js";
import { CHART_BUCKETS, MODEL_LIST_MAX } from "./database.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { avgs, groupNeed, rowsOf, type Series, seriesNeed, sumSeries, totalOf, uniqueNeeds } from "./read.js";

export interface UptimeCheckStats {
  checkId: string;
  runs: number;
  failures: number;
  avgMs: number | null;
  /** Per chart bucket. */
  avgMsSeries: Series;
  runSeries: Series;
  failSeries: Series;
}

export interface UptimeModel {
  meta: ModelMeta;
  starts: number[];
  /** Checks that ran in the range, most runs first. */
  checks: UptimeCheckStats[];
  /** Every check together, now and in the window before. */
  totals: { runs: number; failures: number; avgMs: number | null; prevRuns: number; prevFailures: number; prevAvgMs: number | null };
}

/** One check, or every check. */
const filterOf = (checkId: string | undefined): { filter?: KeyFilter } => (checkId ? { filter: { keys: [checkId] } } : {});

function statsOf(d: NeedResults, checkId: string): UptimeCheckStats {
  const total = rowsOf(d, "chk").find((r) => r.key === checkId)!.agg;
  const s = sumSeries(d, "chart", CHART_BUCKETS, [checkId]);
  return { checkId, runs: total.n, failures: total.err, avgMs: avgOfAgg(total), avgMsSeries: avgs(s), runSeries: s.map((a) => a.n), failSeries: s.map((a) => a.err) };
}

function totalsOf(d: NeedResults): UptimeModel["totals"] {
  const cur = totalOf(d, "all");
  const prev = totalOf(d, "all.prev");
  return { runs: cur.n, failures: cur.err, avgMs: avgOfAgg(cur), prevRuns: prev.n, prevFailures: prev.err, prevAvgMs: avgOfAgg(prev) };
}

/** The Uptime page. Params: check (one check id; all checks without it). */
export const uptimePage: PageDef<UptimeModel> = {
  needs: (ctx) => {
    const one = filterOf(ctx.params.check || undefined);
    const totals = one.filter ? [groupNeed("all", "up.chk", "cur", one), groupNeed("all.prev", "up.chk", "prev", one)] : [groupNeed("all", "up", "cur"), groupNeed("all.prev", "up", "prev")];
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("chk", "up.chk", "cur", { ...one, order: { by: "n", desc: true, limit: MODEL_LIST_MAX } }),
      ...totals,
      seriesNeed("chart", "up.chk", "cur", CHART_BUCKETS, { ...one, split: true }),
    ]);
  },
  model(d) {
    const checks = rowsOf(d, "chk").map((r) => statsOf(d, r.key)).sort((a, b) => b.runs - a.runs || (a.checkId < b.checkId ? -1 : 1));
    return { meta: metaOf(d), starts: bucketStarts(d.window, CHART_BUCKETS), checks, totals: totalsOf(d) };
  },
};
