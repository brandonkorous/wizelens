// The Uptime page's numbers: runs, failures, and response time per check, from the wizelens-uptime service's endpoint rollups.
import { avgOfAgg } from "../scale/agg.js";
import { joinKey } from "../scale/kinds.js";
import type { KeyFilter, NeedResults, PageDef } from "../scale/needs.js";
import { bucketStarts } from "../stats/common.js";
import { checkIdOfEndpoint, UPTIME_METHODS, UPTIME_SERVICE, uptimeRoute } from "../uptime/check.js";
import { CHART_BUCKETS, MODEL_LIST_MAX } from "./database.js";
import { META_NEEDS, type ModelMeta, metaOf } from "./input.js";
import { avgs, groupNeed, rowsOf, type Series, seriesNeed, sumAggs, sumSeries, totalOf, uniqueNeeds } from "./read.js";
import { endpointPrefix } from "./service-detail.js";

const ROW_KEY = `api:${UPTIME_SERVICE}`;

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

/** One check's endpoints (any method), or every uptime endpoint. */
function filterOf(checkId: string | undefined): KeyFilter {
  if (!checkId) return { prefix: endpointPrefix(ROW_KEY) };
  return { keys: UPTIME_METHODS.map((m) => joinKey(ROW_KEY, `${m} ${uptimeRoute(checkId)}`)) };
}

/** Endpoint keys grouped by check id. */
function keysByCheck(d: NeedResults): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const prefix = endpointPrefix(ROW_KEY);
  for (const { key } of rowsOf(d, "ep")) {
    const id = checkIdOfEndpoint(key.slice(prefix.length));
    if (id) out.set(id, [...(out.get(id) ?? []), key]);
  }
  return out;
}

function statsOf(d: NeedResults, checkId: string, keys: readonly string[]): UptimeCheckStats {
  const total = sumAggs(rowsOf(d, "ep").filter((r) => keys.includes(r.key)).map((r) => r.agg));
  const s = sumSeries(d, "chart", CHART_BUCKETS, keys);
  return { checkId, runs: total.n, failures: total.err, avgMs: avgOfAgg(total), avgMsSeries: avgs(s), runSeries: s.map((a) => a.n), failSeries: s.map((a) => a.err) };
}

function totalsOf(d: NeedResults): UptimeModel["totals"] {
  const cur = totalOf(d, "ep");
  const prev = totalOf(d, "ep.prev");
  return { runs: cur.n, failures: cur.err, avgMs: avgOfAgg(cur), prevRuns: prev.n, prevFailures: prev.err, prevAvgMs: avgOfAgg(prev) };
}

/** The Uptime page. Params: check (one check id; all checks without it). */
export const uptimePage: PageDef<UptimeModel> = {
  needs: (ctx) => {
    const filter = filterOf(ctx.params.check || undefined);
    return uniqueNeeds([
      ...META_NEEDS,
      groupNeed("ep", "svc.ep", "cur", { filter, order: { by: "n", desc: true, limit: MODEL_LIST_MAX } }),
      groupNeed("ep.prev", "svc.ep", "prev", { filter }),
      seriesNeed("chart", "svc.ep", "cur", CHART_BUCKETS, { filter, split: true }),
    ]);
  },
  model(d) {
    const checks = [...keysByCheck(d)].map(([id, keys]) => statsOf(d, id, keys)).sort((a, b) => b.runs - a.runs || (a.checkId < b.checkId ? -1 : 1));
    return { meta: metaOf(d), starts: bucketStarts(d.window, CHART_BUCKETS), checks, totals: totalsOf(d) };
  },
};
