import { isTimeRange, type MetricsModel, metricsModelOf, type TimeRange, TIME_RANGES } from "@wizeworks/lens-core/internal";
import type { Ctx } from "../app.js";
import { fail } from "../http/http.js";
import type { TelemetryStore, TenantScope } from "../telemetry/store.js";

const DAY_MS = 86_400_000;
const PARAMS = ["metric", "service", "group", "stat", "q", "where"];

/** Model parameters from the query: the metric, service, grouping, stat, and search. */
export function metricParamsOf(p: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PARAMS) {
    const v = p.get(k);
    if (v) out[k] = v.slice(0, 200);
  }
  return out;
}

/** The metrics page for a scope, from the metric rollup tiers. */
export async function projectMetrics(
  telemetry: TelemetryStore,
  scope: TenantScope,
  range: TimeRange,
  params: Record<string, string>,
  o: { now: number; env?: string },
): Promise<MetricsModel> {
  return metricsModelOf(await telemetry.metricData({ scope, env: o.env }, range, params, o.now));
}

/** The range from the query, checked against the organization's retention. */
export function metricRange(ctx: Ctx, retentionDays: number): TimeRange {
  const range = ctx.url.searchParams.get("range") ?? "1h";
  if (!isTimeRange(range)) return fail(400, `Unknown range "${range}".`);
  if (TIME_RANGES[range].ms > retentionDays * DAY_MS) fail(400, "This range is longer than this project keeps data.");
  return range;
}
