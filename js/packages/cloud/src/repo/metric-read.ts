import {
  alignNow,
  infraSteps,
  type MetricAlertData,
  metricAlertSteps,
  type MetricData,
  metricPageSteps,
  type MetricRows,
  type MetricSql,
  runMetricAsync,
  type TimeRange,
  type TimeWindow,
} from "@wizeworks/lens-core/internal";
import type { Queryable } from "../db/db.js";
import { metricScope, type MetricQuery } from "../telemetry/store.js";

const run = (q: Queryable) => (s: MetricSql) => q.query<Record<string, unknown>>(s.sql, s.args) as Promise<MetricRows>;

/** The metrics page data for a scope, from the metric rollup tiers. `now` is rounded down to 10 s. */
export function loadMetricData(q: Queryable, m: MetricQuery, range: TimeRange, params: Readonly<Record<string, string>>, now: number): Promise<MetricData> {
  return runMetricAsync(metricPageSteps("pg", metricScope(m), range, alignNow(now), params), run(q));
}

/** Host and Kubernetes series for a scope, from the metric rollup tiers. */
export function loadInfraData(q: Queryable, m: MetricQuery, range: TimeRange, params: Readonly<Record<string, string>>, now: number): Promise<MetricData> {
  return runMetricAsync(infraSteps("pg", metricScope(m), range, alignNow(now), params), run(q));
}

/** One metric over an alert rule's window, from the metric rollup tiers. */
export function loadMetricAlertData(q: Queryable, m: MetricQuery, name: string, w: TimeWindow, now: number): Promise<MetricAlertData> {
  return runMetricAsync(metricAlertSteps("pg", metricScope(m), name, w, now), run(q));
}
