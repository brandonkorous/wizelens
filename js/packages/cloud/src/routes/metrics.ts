import { isTimeRange, type MetricsModel, metricsModel, type TimeRange, TIME_RANGES, windowOf } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import type { Queryable } from "../db/db.js";
import { fail } from "../http/http.js";
import { loadMetricPoints } from "../repo/metric-read.js";

const DAY_MS = 86_400_000;
const PARAMS = ["metric", "service", "group", "stat", "q"];

/** Model parameters from the query: the metric, service, grouping, stat, and search. */
export function metricParamsOf(p: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PARAMS) {
    const v = p.get(k);
    if (v) out[k] = v.slice(0, 200);
  }
  return out;
}

/** The metrics page for one project, from the newest points in range. */
export async function projectMetrics(
  db: Queryable,
  projectId: string,
  range: TimeRange,
  params: Record<string, string>,
  o: { now: number; env?: string; limit: number },
): Promise<MetricsModel> {
  const w = windowOf(range, o.now);
  const { points, total } = await loadMetricPoints(db, { projectId, from: w.from, to: w.to, env: o.env, limit: o.limit });
  const sampled = total > points.length ? { used: points.length, total } : null;
  return metricsModel({ points, range, now: o.now, params, sampled });
}

/** The range from the query, checked against the organization's retention. */
export function metricRange(ctx: Ctx, retentionDays: number): TimeRange {
  const range = ctx.url.searchParams.get("range") ?? "1h";
  if (!isTimeRange(range)) return fail(400, `Unknown range "${range}".`);
  if (TIME_RANGES[range].ms > retentionDays * DAY_MS) fail(400, "This range is longer than the organization keeps data.");
  return range;
}
