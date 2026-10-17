// Metric rollups built in memory from raw points, so in-app hosts run the same model as the hub and the cloud.
import { planSeries, planTotals, snapWindow } from "../scale/window.js";
import { type TimeRange, type TimeWindow, windowOf } from "../stats/common.js";
import {
  addMetricPlaced,
  emptyMetricBuckets,
  metricFinestTier,
  METRIC_ALERT_PARTS,
  METRIC_BUCKETS,
  METRIC_SPARK_BUCKETS,
  type MetricAlertData,
  type MetricData,
  type MetricSeriesInfo,
  type MetricPlacement,
  placeMetricRow,
  type MetricRowBuckets,
} from "./from-rollups.js";
import { addMetricRow, type MetricRow, type MetricPointRow, scaleMetricRow, metricSeriesRows } from "./rollup.js";
import { type MetricPoint, seriesKeyOf } from "./types.js";

/** With `tiers`, rows are read through tier buckets like the hosts' SQL; without, by their own time (exact). */
export interface MemoryMetricOptions {
  tiers?: boolean;
}

interface Built {
  info: MetricSeriesInfo;
  rows: MetricPointRow[];
}

function infoOf(id: string, p: MetricPoint): MetricSeriesInfo {
  const info: MetricSeriesInfo = { id, name: p.name, service: p.service, kind: p.kind, unit: p.unit, description: p.description ?? "", attributes: p.attributes };
  if (p.monotonic !== undefined) info.monotonic = p.monotonic;
  if (p.temporality) info.temporality = p.temporality;
  return info;
}

/** Every series of the points, with one row per point; series state runs over all points, oldest first. */
function build(points: readonly MetricPoint[]): Built[] {
  const map = new Map<string, MetricPoint[]>();
  for (const p of points) {
    const key = seriesKeyOf(p);
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  return [...map]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, list]) => {
      const newest = list.reduce((a, b) => (b.timeMs >= a.timeMs ? b : a));
      return { info: infoOf(id, newest), rows: metricSeriesRows(list, null).rows };
    });
}

/** The window's totals: points in it, or (tiers) the weighted tier buckets that answer it. */
function totalOf(rows: readonly MetricPointRow[], w: TimeWindow, now: number, o: MemoryMetricOptions): MetricRow | null {
  let total: MetricRow | null = null;
  const segments = o.tiers ? planTotals(w, now, Number.POSITIVE_INFINITY) : [];
  for (const { timeMs, row } of rows) {
    if (!o.tiers) {
      if (timeMs >= w.from && timeMs < w.to) total = addMetricRow(total, row);
      continue;
    }
    const s = segments.find((g) => {
      const start = Math.floor(timeMs / g.tier.ms) * g.tier.ms;
      return start >= g.from && start < g.to;
    });
    if (s) total = addMetricRow(total, scaleMetricRow(row, s.weight));
  }
  return total;
}

function bucketed(rows: readonly MetricPointRow[], w: TimeWindow, n: number, plan: MetricPlacement): MetricRowBuckets {
  const out = emptyMetricBuckets(n);
  for (const { timeMs, row } of rows) addMetricPlaced(out, row, placeMetricRow(timeMs, w, n, plan));
  return out;
}

const planOf = (w: TimeWindow, n: number, now: number, o: MemoryMetricOptions): MetricPlacement => (o.tiers ? planSeries(w, n, now, Number.POSITIVE_INFINITY) : null);

/** The metrics page data from raw points. */
export function metricDataOf(points: readonly MetricPoint[], range: TimeRange, now: number, params: Readonly<Record<string, string>>, o: MemoryMetricOptions = {}): MetricData {
  const w = o.tiers ? snapWindow(windowOf(range, now), now) : windowOf(range, now);
  const sparkPlan = planOf(w, METRIC_SPARK_BUCKETS, now, o);
  const linePlan = planOf(w, METRIC_BUCKETS, now, o);
  const all = build(points).flatMap((b) => {
    const total = totalOf(b.rows, w, now, o);
    if (!total || total.cnt <= 0) return [];
    const spark = bucketed(b.rows, w, METRIC_SPARK_BUCKETS, sparkPlan);
    return [{ ...b.info, total, spark, line: bucketed(b.rows, w, METRIC_BUCKETS, linePlan) }];
  });
  const service = params.service || "";
  const services = [...new Set(all.map((s) => s.service))].sort();
  return { range, window: w, params, services, series: service ? all.filter((s) => s.service === service) : all };
}

/** Gauge values for percentiles: every point, or (tiers) the means of the finest tier's buckets. */
function valuesOf(rows: readonly MetricPointRow[], w: TimeWindow, now: number, o: MemoryMetricOptions): number[] {
  const valued = rows.filter((r) => r.row.lastV !== null);
  if (!o.tiers) return valued.filter((r) => r.timeMs >= w.from && r.timeMs < w.to).map((r) => r.row.lastV!);
  const tier = metricFinestTier(w, now);
  const sums = new Map<number, [number, number]>();
  for (const r of valued) {
    const b = Math.floor(r.timeMs / tier.ms) * tier.ms;
    const s = sums.get(b) ?? [0, 0];
    if (b >= w.from && b < w.to) sums.set(b, [s[0] + r.row.vsum, s[1] + r.row.cnt]);
  }
  return [...sums.values()].map(([sum, cnt]) => sum / cnt);
}

/** One metric's alert data over a window, from its raw points. */
export function metricAlertDataOf(points: readonly MetricPoint[], w: TimeWindow, now = w.to, o: MemoryMetricOptions = {}): MetricAlertData {
  const plan = planOf(w, METRIC_ALERT_PARTS, now, o);
  const series = build(points).flatMap((b) => {
    const total = totalOf(b.rows, w, now, o);
    if (!total || total.cnt <= 0) return [];
    return [{ ...b.info, total, parts: bucketed(b.rows, w, METRIC_ALERT_PARTS, plan), values: valuesOf(b.rows, w, now, o) }];
  });
  return { window: w, series };
}
