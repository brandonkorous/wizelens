// Metric points to per-series rollup rows: what each point adds to its time bucket, and the series state between points.
import { isKept, type Tier, TIERS } from "../scale/window.js";
import { histDelta, type MergedHistogram, mergeHistogram } from "./series.js";
import type { MetricHistogram, MetricPoint } from "./types.js";

/** What a series remembers between points: its newest point, for counter and histogram deltas. */
export interface MetricState {
  lastMs: number;
  lastValue: number | null;
  lastHist: MetricHistogram | null;
}

/** Sums over the points of one series in one bucket. Values count every point; rate and hist hold deltas only. */
export interface MetricRow {
  cnt: number;
  vsum: number;
  vmin: number | null;
  vmax: number | null;
  firstMs: number;
  firstV: number | null;
  lastMs: number;
  lastV: number | null;
  /** Counters: the change, and the time it took, in ms. */
  rateDelta: number;
  rateMs: number;
  hist: MergedHistogram | null;
}

/** One point's row, at the point's time. */
export interface MetricPointRow {
  timeMs: number;
  row: MetricRow;
}

const NO_RATE = { rateDelta: 0, rateMs: 0 };

/** Counter change: delta points as they are, cumulative ones against the state; a drop means a restart. */
function rateOf(p: MetricPoint, prev: MetricState | null): { rateDelta: number; rateMs: number } {
  if (p.kind !== "sum" || !p.monotonic) return NO_RATE;
  const v = p.value ?? 0;
  if (p.temporality === "delta") {
    const dt = p.startMs !== undefined ? p.timeMs - p.startMs : prev ? p.timeMs - prev.lastMs : 0;
    return dt > 0 ? { rateDelta: v, rateMs: dt } : NO_RATE;
  }
  if (!prev || prev.lastValue === null) return NO_RATE;
  return { rateDelta: v >= prev.lastValue ? v - prev.lastValue : v, rateMs: p.timeMs - prev.lastMs };
}

function histOf(p: MetricPoint, prev: MetricState | null, late: boolean): MergedHistogram | null {
  if (!p.histogram) return null;
  const delta = p.temporality === "delta";
  if (!delta && late) return null;
  const h = histDelta(p.histogram, prev?.lastHist ?? undefined, delta);
  return h && h.count > 0 ? mergeHistogram(null, h) : null;
}

/** What one point adds, given the series state. A point not newer than the state adds its value but no delta. */
export function metricPointRow(p: MetricPoint, state: MetricState | null): { row: MetricRow; next: MetricState | null } {
  const late = state !== null && p.timeMs <= state.lastMs;
  const v = p.value ?? null;
  const rate = late && p.temporality !== "delta" ? NO_RATE : rateOf(p, late ? null : state);
  const t = p.timeMs;
  const row: MetricRow = { cnt: 1, vsum: v ?? 0, vmin: v, vmax: v, firstMs: t, firstV: v, lastMs: t, lastV: v, ...rate, hist: histOf(p, state, late) };
  return { row, next: late ? state : { lastMs: t, lastValue: v, lastHist: p.histogram ?? null } };
}

const minOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
const maxOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

/** Two rows as one: sums add, min and max keep the extremes, first and last keep the oldest and newest point. */
export function addMetricRow(a: MetricRow | null, b: MetricRow): MetricRow {
  if (!a) return b;
  const first = b.firstMs < a.firstMs ? b : a;
  const last = b.lastMs >= a.lastMs ? b : a;
  return {
    cnt: a.cnt + b.cnt,
    vsum: a.vsum + b.vsum,
    vmin: minOf(a.vmin, b.vmin),
    vmax: maxOf(a.vmax, b.vmax),
    firstMs: first.firstMs,
    firstV: first.firstV,
    lastMs: last.lastMs,
    lastV: last.lastV,
    rateDelta: a.rateDelta + b.rateDelta,
    rateMs: a.rateMs + b.rateMs,
    hist: b.hist ? mergeHistogram(a.hist, b.hist) : a.hist,
  };
}

/** A share of a row, for a bucket that is spread over page buckets. Extremes and first and last stay as they are. */
export function scaleMetricRow(r: MetricRow, share: number): MetricRow {
  if (share === 1) return r;
  const h = r.hist && { ...r.hist, count: r.hist.count * share, sum: r.hist.sum * share, counts: r.hist.counts.map((c) => c * share) };
  return { ...r, cnt: r.cnt * share, vsum: r.vsum * share, rateDelta: r.rateDelta * share, rateMs: r.rateMs * share, hist: h };
}

/** The rows of one series' points, sorted by time (stable), starting from a stored state. */
export function metricSeriesRows(points: readonly MetricPoint[], state: MetricState | null): { rows: MetricPointRow[]; state: MetricState | null } {
  const sorted = [...points].sort((a, b) => a.timeMs - b.timeMs);
  const rows: MetricPointRow[] = [];
  let s = state;
  for (const p of sorted) {
    const { row, next } = metricPointRow(p, s);
    rows.push({ timeMs: p.timeMs, row });
    s = next;
  }
  return { rows, state: s };
}

/** One tier bucket of one series, as written at ingest. */
export interface MetricTierRow {
  tier: Tier;
  bucket: number;
  row: MetricRow;
}

/** Point rows summed per tier bucket, for the tiers that still keep that time. The 1h tier is pruned by retention later. */
export function metricTierRows(rows: readonly MetricPointRow[], now: number): MetricTierRow[] {
  const out = new Map<string, MetricTierRow>();
  for (const { timeMs, row } of rows) {
    for (const tier of TIERS) {
      if (!isKept(tier, timeMs, now, Number.POSITIVE_INFINITY)) continue;
      const bucket = Math.floor(timeMs / tier.ms) * tier.ms;
      const key = `${tier.name}:${bucket}`;
      const hit = out.get(key);
      out.set(key, { tier, bucket, row: addMetricRow(hit?.row ?? null, row) });
    }
  }
  return [...out.values()];
}
