import { percentileOf, type TimeWindow } from "../stats/common.js";
import { fmtMetric } from "./format.js";
import { bucketSeries, displayOf, displayUnitOf, histStat, mergeBuckets, type MergedHistogram } from "./series.js";
import { type MetricPoint, seriesKeyOf } from "./types.js";

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

// Rates and histograms are cut into this many parts, for "last", "max", and percentiles of a rate.
const PARTS = 10;

function bySeries(points: readonly MetricPoint[]): MetricPoint[][] {
  const map = new Map<string, MetricPoint[]>();
  for (const p of points) {
    const key = seriesKeyOf(p);
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  return [...map.values()].map((s) => s.sort((a, b) => a.timeMs - b.timeMs));
}

/** Gauges and up-down sums: the raw values. "rate" is the change per second. */
function valueStat(series: MetricPoint[][], stat: MetricAlertStat): number | null {
  const values = series.flatMap((s) => s.map((p) => p.value ?? 0));
  if (stat === "last") return series.reduce((t, s) => t + (s.at(-1)!.value ?? 0), 0) / series.length;
  if (stat === "avg") return values.reduce((t, v) => t + v, 0) / values.length;
  if (stat === "max") return Math.max(...values);
  if (stat === "p95" || stat === "p99") return percentileOf(values, stat === "p95" ? 95 : 99);
  const moves = series.filter((s) => s.length > 1).map((s) => ((s.at(-1)!.value ?? 0) - (s[0]!.value ?? 0)) / ((s.at(-1)!.timeMs - s[0]!.timeMs) / 1000));
  return moves.length ? moves.reduce((t, v) => t + v, 0) : null;
}

/** Counters: the rate per second over the window, or over its parts. */
function rateStat(series: MetricPoint[][], w: TimeWindow, stat: MetricAlertStat): number | null {
  if (stat === "avg" || stat === "rate") return mergeBuckets(series.map((s) => bucketSeries(s, w, 1)), 1).values[0] ?? null;
  const parts = mergeBuckets(series.map((s) => bucketSeries(s, w, PARTS)), PARTS).values.filter((v): v is number => v != null);
  if (parts.length === 0) return null;
  if (stat === "last") return parts.at(-1)!;
  if (stat === "max") return Math.max(...parts);
  return percentileOf(parts, stat === "p95" ? 95 : 99);
}

/** Histograms: percentiles of all values in the window; "rate" is values per second. */
function histogramStat(series: MetricPoint[][], w: TimeWindow, stat: MetricAlertStat): number | null {
  const all = mergeBuckets(series.map((s) => bucketSeries(s, w, 1)), 1).hists[0] ?? null;
  if (stat === "rate") return all ? all.count / ((w.to - w.from) / 1000) : null;
  if (stat === "max") return all?.max ?? histStat(all, "p99");
  if (stat === "last") {
    const parts = mergeBuckets(series.map((s) => bucketSeries(s, w, PARTS)), PARTS).hists.filter((h): h is MergedHistogram => !!h);
    return histStat(parts.at(-1) ?? null, "avg");
  }
  return histStat(all, stat === "avg" ? "avg" : stat);
}

/** One metric's value over a window, from the points of that metric. Null when there is no data. */
export function metricAlertValue(points: readonly MetricPoint[], w: TimeWindow, stat: MetricAlertStat): number | null {
  const series = bySeries(points.filter((p) => p.timeMs >= w.from && p.timeMs < w.to));
  if (series.length === 0) return null;
  const display = displayOf(series[0]![0]!);
  if (display === "value") return valueStat(series, stat);
  return display === "rate" ? rateStat(series, w, stat) : histogramStat(series, w, stat);
}

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
