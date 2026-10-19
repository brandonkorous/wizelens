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
} from "@wizeworks/lens-core";
import type { Queryable } from "../db/db.js";

export interface MetricQuery {
  projectId: string;
  env?: string;
  service?: string;
}

const run = (q: Queryable) => (s: MetricSql) => q.query<Record<string, unknown>>(s.sql, s.args) as Promise<MetricRows>;

/** The metrics page data for one project, from the metric rollup tiers. `now` is rounded down to 10 s. */
export function loadMetricData(q: Queryable, m: MetricQuery, range: TimeRange, params: Readonly<Record<string, string>>, now: number): Promise<MetricData> {
  return runMetricAsync(metricPageSteps("pg", { project: m.projectId, env: m.env }, range, alignNow(now), params), run(q));
}

/** Host and Kubernetes series for one project, from the metric rollup tiers. */
export function loadInfraData(q: Queryable, m: MetricQuery, range: TimeRange, params: Readonly<Record<string, string>>, now: number): Promise<MetricData> {
  return runMetricAsync(infraSteps("pg", { project: m.projectId, env: m.env }, range, alignNow(now), params), run(q));
}

/** One metric over an alert rule's window, from the metric rollup tiers. */
export function loadMetricAlertData(q: Queryable, m: MetricQuery, name: string, w: TimeWindow, now: number): Promise<MetricAlertData> {
  return runMetricAsync(metricAlertSteps("pg", { project: m.projectId, env: m.env, service: m.service }, name, w, now), run(q));
}
