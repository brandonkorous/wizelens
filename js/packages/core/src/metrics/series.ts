import { bucketIndex, type TimeWindow } from "../stats/common.js";
import type { MetricHistogram, MetricPoint } from "./types.js";

/** How a metric is drawn: gauges and up-down sums as values, counters as a rate per second, histograms as percentiles. */
export type MetricDisplay = "value" | "rate" | "percentiles";

/** A histogram stat to draw. */
export type HistogramStat = "p50" | "p95" | "p99" | "avg";

/** Histogram counts added up over one time bucket. */
export interface MergedHistogram {
  bounds: number[];
  counts: number[];
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
}

/** One series (or a merge of several) over the time buckets. */
export interface Buckets {
  display: MetricDisplay;
  values: (number | null)[];
  hists: (MergedHistogram | null)[];
}

export const displayOf = (p: Pick<MetricPoint, "kind" | "monotonic">): MetricDisplay =>
  p.kind === "histogram" ? "percentiles" : p.kind === "sum" && p.monotonic ? "rate" : "value";

/** The unit of what is drawn: a counter in "By" is drawn in "By/s". */
export const displayUnitOf = (unit: string, display: MetricDisplay): string => (display === "rate" ? `${unit === "1" ? "" : unit}/s` : unit);

function valueBuckets(points: readonly MetricPoint[], w: TimeWindow, n: number): (number | null)[] {
  const sums = new Array<number>(n).fill(0);
  const counts = new Array<number>(n).fill(0);
  for (const p of points) {
    const i = bucketIndex(p.timeMs, w, n);
    if (i >= 0 && p.value !== undefined) (sums[i]! += p.value), counts[i]!++;
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i]! : null));
}

/** Change per second. Cumulative counters use the gap to the previous point; a drop means the counter restarted. */
function rateBuckets(points: readonly MetricPoint[], w: TimeWindow, n: number): (number | null)[] {
  const deltas = new Array<number>(n).fill(0);
  const spans = new Array<number>(n).fill(0);
  points.forEach((p, k) => {
    const prev = points[k - 1];
    const v = p.value ?? 0;
    const delta = p.temporality === "delta" ? v : prev ? (v >= (prev.value ?? 0) ? v - (prev.value ?? 0) : v) : null;
    const dt = p.temporality === "delta" && p.startMs !== undefined ? p.timeMs - p.startMs : prev ? p.timeMs - prev.timeMs : 0;
    const i = bucketIndex(p.timeMs, w, n);
    if (i < 0 || delta === null || dt <= 0) return;
    deltas[i]! += delta;
    spans[i]! += dt;
  });
  return deltas.map((d, i) => (spans[i]! > 0 ? (d / spans[i]!) * 1000 : null));
}

const sameBounds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The histogram of one point alone. Cumulative points are turned into the change since the previous one. */
function histDelta(p: MetricHistogram, prev: MetricHistogram | undefined, delta: boolean): MetricHistogram | null {
  if (delta) return p;
  if (!prev) return null;
  if (p.count < prev.count || !sameBounds(p.bounds, prev.bounds)) return p;
  return { ...p, count: p.count - prev.count, sum: p.sum - prev.sum, counts: p.counts.map((c, i) => c - (prev.counts[i] ?? 0)) };
}

/** Add one histogram into a merge. Different bucket bounds keep count and sum only. */
export function mergeHistogram(into: MergedHistogram | null, h: MetricHistogram | MergedHistogram): MergedHistogram {
  const minOf = (a: number | null | undefined, b: number | null | undefined) => (a == null ? (b ?? null) : b == null ? a : Math.min(a, b));
  const maxOf = (a: number | null | undefined, b: number | null | undefined) => (a == null ? (b ?? null) : b == null ? a : Math.max(a, b));
  if (!into) return { bounds: [...h.bounds], counts: [...h.counts], count: h.count, sum: h.sum, min: h.min ?? null, max: h.max ?? null };
  const same = sameBounds(into.bounds, h.bounds) && into.counts.length === h.counts.length;
  return {
    bounds: same ? into.bounds : [],
    counts: same ? into.counts.map((c, i) => c + h.counts[i]!) : [],
    count: into.count + h.count,
    sum: into.sum + h.sum,
    min: minOf(into.min, h.min),
    max: maxOf(into.max, h.max),
  };
}

function histBuckets(points: readonly MetricPoint[], w: TimeWindow, n: number): (MergedHistogram | null)[] {
  const out = new Array<MergedHistogram | null>(n).fill(null);
  points.forEach((p, k) => {
    const h = p.histogram && histDelta(p.histogram, points[k - 1]?.histogram, p.temporality === "delta");
    const i = bucketIndex(p.timeMs, w, n);
    if (h && i >= 0 && h.count > 0) out[i] = mergeHistogram(out[i]!, h);
  });
  return out;
}

/** One series, points sorted by time, over `n` buckets. */
export function bucketSeries(points: readonly MetricPoint[], w: TimeWindow, n: number): Buckets {
  const display = displayOf(points[0] ?? { kind: "gauge" });
  if (display === "percentiles") return { display, values: new Array(n).fill(null), hists: histBuckets(points, w, n) };
  const values = display === "rate" ? rateBuckets(points, w, n) : valueBuckets(points, w, n);
  return { display, values, hists: [] };
}

/** Several series as one: rates add up, values average, histograms merge. */
export function mergeBuckets(list: readonly Buckets[], n: number): Buckets {
  const display = list[0]?.display ?? "value";
  if (display === "percentiles") {
    const hists = Array.from({ length: n }, (_, i) => list.reduce<MergedHistogram | null>((m, b) => (b.hists[i] ? mergeHistogram(m, b.hists[i]!) : m), null));
    return { display, values: new Array(n).fill(null), hists };
  }
  const values = Array.from({ length: n }, (_, i) => {
    const vs = list.map((b) => b.values[i]).filter((v): v is number => v != null);
    if (vs.length === 0) return null;
    const total = vs.reduce((t, v) => t + v, 0);
    return display === "rate" ? total : total / vs.length;
  });
  return { display, values, hists: [] };
}

/** A percentile from bucket counts, by straight-line steps inside the bucket. Null without buckets. */
export function histogramPercentile(h: MergedHistogram, p: number): number | null {
  if (h.count <= 0 || h.counts.length === 0) return null;
  const target = p * h.count;
  let seen = 0;
  for (let i = 0; i < h.counts.length; i++) {
    const c = h.counts[i]!;
    if (c > 0 && seen + c >= target) {
      const lower = i === 0 ? (h.min ?? Math.min(0, h.bounds[0] ?? 0)) : h.bounds[i - 1]!;
      const upper = i < h.bounds.length ? h.bounds[i]! : (h.max ?? h.bounds.at(-1) ?? lower);
      const at = lower + (upper - lower) * ((target - seen) / c);
      return Math.min(h.max ?? at, Math.max(h.min ?? at, at));
    }
    seen += c;
  }
  return h.max ?? h.bounds.at(-1) ?? null;
}

/** The value drawn for one histogram bucket. */
export function histStat(h: MergedHistogram | null, stat: HistogramStat): number | null {
  if (!h || h.count <= 0) return null;
  if (stat === "avg") return h.sum / h.count;
  return histogramPercentile(h, stat === "p50" ? 0.5 : stat === "p95" ? 0.95 : 0.99);
}

/** The line to draw: values as they are, or one histogram stat per bucket. */
export const lineOf = (b: Buckets, stat: HistogramStat): (number | null)[] => (b.display === "percentiles" ? b.hists.map((h) => histStat(h, stat)) : b.values);
