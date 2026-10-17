import { percentileOf, type TimeWindow } from "../stats/common.js";
import { fmtMetric } from "./format.js";
import { metricBucketsOf, METRIC_ALERT_PARTS, type MetricAlertData, type MetricAlertSeries } from "./from-rollups.js";
import { metricAlertDataOf } from "./memory.js";
import { displayOf, displayUnitOf, histStat, type MergedHistogram, mergeBuckets, mergeHistogram } from "./series.js";
import type { MetricPoint } from "./types.js";

/** What a metric alert rule reads over its window. */
export const METRIC_ALERT_STATS = {
  last: "Newest value",
  avg: "Average",
  max: "Highest",
  p95: "p95",
  p99: "p99",
  rate: "Per second",
} as const;

export type MetricAlertStat = keyof typeof METRIC_ALERT_STATS;

export const isMetricAlertStat = (v: unknown): v is MetricAlertStat => typeof v === "string" && v in METRIC_ALERT_STATS;

type Series = readonly MetricAlertSeries[];

/** Gauges and up-down sums: the values. "rate" is the change per second from each series' first to last point. */
function valueStat(series: Series, stat: MetricAlertStat): number | null {
  const count = series.reduce((t, s) => t + s.total.cnt, 0);
  if (stat === "last") return series.reduce((t, s) => t + (s.total.lastV ?? 0), 0) / series.length;
  if (stat === "avg") return count > 0 ? series.reduce((t, s) => t + s.total.vsum, 0) / count : null;
  if (stat === "max") return Math.max(...series.map((s) => s.total.vmax ?? Number.NEGATIVE_INFINITY));
  if (stat === "p95" || stat === "p99") return percentileOf(series.flatMap((s) => s.values), stat === "p95" ? 95 : 99);
  const moves = series
    .filter((s) => s.total.cnt > 1)
    .map((s) => ((s.total.lastV ?? 0) - (s.total.firstV ?? 0)) / ((s.total.lastMs - s.total.firstMs) / 1000));
  return moves.length ? moves.reduce((t, v) => t + v, 0) : null;
}

const partsOf = (series: Series) => mergeBuckets(series.map((s) => metricBucketsOf(displayOf(s), s.parts, METRIC_ALERT_PARTS)), METRIC_ALERT_PARTS);

/** Counters: the rate per second over the window, or over its parts. */
function rateStat(series: Series, stat: MetricAlertStat): number | null {
  if (stat === "avg" || stat === "rate") {
    const rates = series.filter((s) => s.total.rateMs > 0).map((s) => (s.total.rateDelta / s.total.rateMs) * 1000);
    return rates.length ? rates.reduce((t, v) => t + v, 0) : null;
  }
  const parts = partsOf(series).values.filter((v): v is number => v != null);
  if (parts.length === 0) return null;
  if (stat === "last") return parts.at(-1)!;
  if (stat === "max") return Math.max(...parts);
  return percentileOf(parts, stat === "p95" ? 95 : 99);
}

/** Histograms: percentiles of all values in the window; "rate" is values per second. */
function histogramStat(series: Series, w: TimeWindow, stat: MetricAlertStat): number | null {
  const parts = partsOf(series).hists.filter((h): h is MergedHistogram => !!h);
  const all = parts.reduce<MergedHistogram | null>((m, h) => mergeHistogram(m, h), null);
  if (stat === "rate") return all ? all.count / ((w.to - w.from) / 1000) : null;
  if (stat === "max") return all?.max ?? histStat(all, "p99");
  if (stat === "last") return histStat(parts.at(-1) ?? null, "avg");
  return histStat(all, stat === "avg" ? "avg" : stat);
}

/** One metric's value over a window, from its rollup data. Null when there is no data. */
export function metricAlertValueOf(d: MetricAlertData, stat: MetricAlertStat): number | null {
  if (d.series.length === 0) return null;
  const display = displayOf(d.series[0]!);
  if (display === "value") return valueStat(d.series, stat);
  return display === "rate" ? rateStat(d.series, stat) : histogramStat(d.series, d.window, stat);
}

/** One metric's value over a window, from the points of that metric (rollups are built in memory). */
export const metricAlertValue = (points: readonly MetricPoint[], w: TimeWindow, stat: MetricAlertStat): number | null =>
  metricAlertValueOf(metricAlertDataOf(points, w), stat);

/** The unit a metric alert value is in. */
export function metricAlertUnit(sample: Pick<MetricPoint, "kind" | "monotonic" | "unit">, stat: MetricAlertStat): string {
  const display = displayOf(sample);
  if (stat === "rate" && display !== "rate") return display === "percentiles" ? "/s" : displayUnitOf(sample.unit, "rate");
  return displayUnitOf(sample.unit, display);
}

/** "http.server.request.duration p95 is 420 ms (above 300 ms)". */
export function metricAlertMessage(name: string, stat: MetricAlertStat, op: ">" | "<", value: number | null, threshold: number, unit: string): string {
  const shown = value === null ? "not measured" : fmtMetric(value, unit);
  return `${name} ${METRIC_ALERT_STATS[stat].toLowerCase()} is ${shown} (${op === ">" ? "above" : "below"} ${fmtMetric(threshold, unit)})`;
}
