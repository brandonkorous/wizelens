import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { alignNow, isTimeRange, metricPageSteps, type MetricRows, type MetricsModel, metricsModelOf, runMetricSync, type TimeRange } from "@wizeworks/lens-core";

export interface MetricScope {
  project?: string;
  env?: string;
}

/** Parameters the metrics model reads; the range and scope are taken out. */
export function metricParams(p: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["metric", "service", "group", "stat", "q"]) {
    const v = p.get(k);
    if (v) out[k] = v.slice(0, 200);
  }
  return out;
}

export const rangeOf = (v: string | null | undefined, fallback: TimeRange = "1h"): TimeRange => (v && isTimeRange(v) ? v : fallback);

/** The metrics page for a scope and range, from the metric rollup tiers. */
export function metricsPage(db: DatabaseSync, range: TimeRange, scope: MetricScope, params: Record<string, string>, now: number): MetricsModel {
  const steps = metricPageSteps("sqlite", { project: scope.project || undefined, env: scope.env || undefined }, range, alignNow(now), params);
  return metricsModelOf(runMetricSync(steps, (q) => db.prepare(q.sql).all(...(q.args as SQLInputValue[])) as MetricRows));
}
