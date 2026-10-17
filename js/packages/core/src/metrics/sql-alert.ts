// Metric alert reads as steps of SQL: one metric's series over the rule's window, from rollups.
import { planSeries, planTotals } from "../scale/window.js";
import type { TimeWindow } from "../stats/common.js";
import { emptyMetricBuckets, metricFinestTier, METRIC_ALERT_PARTS, type MetricAlertData, type MetricAlertSeries } from "./from-rollups.js";
import { displayOf } from "./series.js";
import { metricBucketsSql, metricEndsSql, metricGaugeValuesSql, metricHistRowsSql, type MetricDialect, type MetricSqlScope, metricTotalsSql } from "./sql.js";
import { fillMetricBuckets, type MetricSteps, metricSeriesIdOf, metricSeriesOfRows } from "./sql-read.js";

/** The alert data of metric `name` over `w` (aligned by the host), as SQL steps. */
export function* metricAlertSteps(d: MetricDialect, scope: MetricSqlScope, name: string, w: TimeWindow, now: number): MetricSteps<MetricAlertData> {
  const one = { ...scope, names: [name] };
  const segments = planTotals(w, now, Number.POSITIVE_INFINITY);
  const [totals, ends] = [metricTotalsSql(d, one, segments), metricEndsSql(d, one, segments)];
  if (!totals || !ends) return { window: w, series: [] };
  const [tRows, eRows] = yield [totals, ends];
  const series: MetricAlertSeries[] = metricSeriesOfRows(tRows!, eRows!).map(({ spark: _s, line: _l, ...s }) => ({ ...s, parts: emptyMetricBuckets(METRIC_ALERT_PARTS), values: [] }));
  if (series.length === 0) return { window: w, series };
  const plan = planSeries(w, METRIC_ALERT_PARTS, now, Number.POSITIVE_INFINITY);
  const display = displayOf(series[0]!);
  const parts = display === "percentiles" ? metricHistRowsSql(d, one, w, plan.tier) : metricBucketsSql(d, one, w, METRIC_ALERT_PARTS, plan);
  const queries = display === "value" ? [parts, metricGaugeValuesSql(d, one, w, metricFinestTier(w, now))] : [parts];
  const [partRows, valueRows] = yield queries;
  const byId = new Map(series.map((s) => [s.id, s]));
  fillMetricBuckets(byId, partRows!, w, METRIC_ALERT_PARTS, plan, (s) => s.parts);
  for (const r of valueRows ?? []) byId.get(metricSeriesIdOf(r))?.values.push(Number(r.vsum) / Number(r.cnt));
  return { window: w, series };
}
