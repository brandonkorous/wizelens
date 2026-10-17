// What the metrics page and metric alerts read: per-series rollup rows over the window and its page buckets.
import { isKept, type SeriesMode, spreadBucket, type Tier, TIERS } from "../scale/window.js";
import { bucketIndex, type TimeRange, type TimeWindow } from "../stats/common.js";
import type { Attributes } from "../types.js";
import { addMetricRow, type MetricRow, scaleMetricRow } from "./rollup.js";
import type { Buckets, MergedHistogram, MetricDisplay } from "./series.js";
import type { MetricKind } from "./types.js";

export const METRIC_BUCKETS = 60;
export const METRIC_SPARK_BUCKETS = 24;
/** Rates and histograms in alerts are cut into this many parts, for "last", "max", and percentiles of a rate. */
export const METRIC_ALERT_PARTS = 10;

/** What a series is, from its newest point. `id` is unique in one answer. */
export interface MetricSeriesInfo {
  id: string;
  name: string;
  service: string;
  kind: MetricKind;
  unit: string;
  description: string;
  monotonic?: boolean;
  temporality?: "delta" | "cumulative";
  attributes: Attributes;
}

/** Rows per page bucket; null where the series has nothing. */
export type MetricRowBuckets = (MetricRow | null)[];

export interface MetricSeriesData extends MetricSeriesInfo {
  /** The whole window. */
  total: MetricRow;
  /** METRIC_SPARK_BUCKETS and METRIC_BUCKETS buckets; null when the page does not need them. */
  spark: MetricRowBuckets | null;
  line: MetricRowBuckets | null;
}

/** What the metrics page is computed from: the series with points in the window, after the service filter. */
export interface MetricData {
  range: TimeRange;
  window: TimeWindow;
  params: Readonly<Record<string, string>>;
  /** Every service with points in the window, before the service filter. */
  services: string[];
  series: MetricSeriesData[];
}

export interface MetricAlertSeries extends MetricSeriesInfo {
  total: MetricRow;
  parts: MetricRowBuckets;
  /** Gauge values for percentiles: points in memory, the finest bucket means in SQL. */
  values: number[];
}

/** What a metric alert reads: one metric's series over the rule's window. */
export interface MetricAlertData {
  window: TimeWindow;
  series: MetricAlertSeries[];
}

/** How rows reach page buckets: null places them by their own time; a tier places tier buckets by midpoint or overlap. */
export type MetricPlacement = { tier: Tier; mode: SeriesMode } | null;

export interface MetricPlace {
  index: number;
  share: number;
}

/** Page buckets of one tier bucket: the one holding its midpoint ("sql"), or every one it overlaps ("split"). */
export function placeMetricBucket(start: number, w: TimeWindow, n: number, plan: NonNullable<MetricPlacement>): MetricPlace[] {
  if (plan.mode === "split") return spreadBucket(start, plan.tier.ms, w, n);
  const mid = start + plan.tier.ms / 2;
  if (mid < w.from || mid >= w.to) return [];
  return [{ index: Math.min(n - 1, Math.floor((mid - w.from) / ((w.to - w.from) / n))), share: 1 }];
}

/** Page buckets of a row at `timeMs`. */
export function placeMetricRow(timeMs: number, w: TimeWindow, n: number, plan: MetricPlacement): MetricPlace[] {
  if (plan) return placeMetricBucket(Math.floor(timeMs / plan.tier.ms) * plan.tier.ms, w, n, plan);
  const i = bucketIndex(timeMs, w, n);
  return i < 0 ? [] : [{ index: i, share: 1 }];
}

/** Add a row into page buckets. */
export function addMetricPlaced(into: MetricRowBuckets, row: MetricRow, places: readonly MetricPlace[]): void {
  for (const { index, share } of places) into[index] = addMetricRow(into[index] ?? null, scaleMetricRow(row, share));
}

/** The finest tier that still keeps the window's start: its bucket means stand in for gauge values in alerts. */
export const metricFinestTier = (w: TimeWindow, now: number): Tier => TIERS.find((t) => isKept(t, w.from, now, Number.POSITIVE_INFINITY)) ?? TIERS.at(-1)!;

export const emptyMetricBuckets = (n: number): MetricRowBuckets => new Array<MetricRow | null>(n).fill(null);

const histAt = (r: MetricRow | null): MergedHistogram | null => (r?.hist && r.hist.count > 0 ? r.hist : null);

/** One value per bucket: the average of a value, the rate per second of a counter, or the histogram of the bucket. */
export function metricBucketsOf(display: MetricDisplay, rows: MetricRowBuckets | null, n: number): Buckets {
  const at = (i: number) => rows?.[i] ?? null;
  if (display === "percentiles") return { display, values: new Array(n).fill(null), hists: Array.from({ length: n }, (_, i) => histAt(at(i))) };
  const values = Array.from({ length: n }, (_, i) => {
    const r = at(i);
    if (!r) return null;
    if (display === "rate") return r.rateMs > 0 ? (r.rateDelta / r.rateMs) * 1000 : null;
    return r.cnt > 0 ? r.vsum / r.cnt : null;
  });
  return { display, values, hists: [] };
}
