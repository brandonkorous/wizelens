// Rollup tiers, and which tier buckets answer a window's totals or series.
import type { TimeWindow } from "../stats/common.js";

export type TierName = "10s" | "5m" | "1h";

export interface Tier {
  name: TierName;
  ms: number;
  /** How long buckets are kept; null means the project's retention. */
  keepMs: number | null;
  table: string;
  hist: string;
}

export const TIERS: readonly Tier[] = [
  { name: "10s", ms: 10_000, keepMs: 6 * 3_600_000 + 600_000, table: "rollup_10s", hist: "hist_10s" },
  { name: "5m", ms: 300_000, keepMs: 50 * 3_600_000, table: "rollup_5m", hist: "hist_5m" },
  { name: "1h", ms: 3_600_000, keepMs: null, table: "rollup_1h", hist: "hist_1h" },
];

export const tierByName = (name: TierName): Tier => TIERS.find((t) => t.name === name)!;

/** Tier buckets with starts in [from, to). Weight is below 1 only for one partial edge bucket. */
export interface Segment {
  tier: Tier;
  from: number;
  to: number;
  weight: number;
}

/** Hosts round "now" down to the finest tier, so windows line up with whole buckets. */
export const alignNow = (now: number): number => Math.floor(now / 10_000) * 10_000;

export const tierKeepMs = (t: Tier, retentionMs: number): number => t.keepMs ?? retentionMs;

/** Buckets starting at or before this time are wholly older than now − keep, so pruning deletes them (`bucket_ms <= cutoff`). */
export const tierCutoff = (t: Tier, now: number, keepMs: number): number => now - keepMs - t.ms;

/** True when the tier still has the bucket that holds `timeMs`: some part of the bucket is newer than now − keep. */
export function isKept(t: Tier, timeMs: number, now: number, retentionMs: number): boolean {
  return Math.floor(timeMs / t.ms) * t.ms > tierCutoff(t, now, tierKeepMs(t, retentionMs));
}

/** The window with its start moved back to a bucket edge of the finest tier still kept there, so totals need no weighted edge. */
export function snapWindow(w: TimeWindow, now: number): TimeWindow {
  const tier = TIERS.find((t) => isKept(t, w.from, now, Number.POSITIVE_INFINITY)) ?? TIERS[TIERS.length - 1]!;
  return { from: Math.floor(w.from / tier.ms) * tier.ms, to: w.to };
}

interface Plan {
  now: number;
  retentionMs: number;
}

const partial = (tier: Tier, start: number, overlap: number): Segment => ({ tier, from: start, to: start + tier.ms, weight: overlap / tier.ms });

/** One edge [from, to) inside a single bucket of tier i: finer tiers when they are kept, else a weighted bucket. */
function edge(from: number, to: number, i: number, p: Plan): Segment[] {
  if (from >= to) return [];
  const finer = TIERS[i - 1];
  if (finer && isKept(finer, from, p.now, p.retentionMs)) return cover(from, to, i - 1, p);
  const tier = TIERS[i]!;
  return [partial(tier, Math.floor(from / tier.ms) * tier.ms, to - from)];
}

/** Cover [from, to) with whole buckets of tier i, and the edges with finer tiers. */
function cover(from: number, to: number, i: number, p: Plan): Segment[] {
  const tier = TIERS[i]!;
  const a = Math.ceil(from / tier.ms) * tier.ms;
  const b = Math.floor(to / tier.ms) * tier.ms;
  if (a > b) return edge(from, to, i, p);
  const whole = a < b ? [{ tier, from: a, to: b, weight: 1 }] : [];
  return [...edge(from, a, i, p), ...whole, ...edge(b, to, i, p)];
}

/** The main tier: the coarsest one with at least 24 buckets in the window that still covers its start. */
function mainTier(w: TimeWindow, p: Plan): number {
  const kept = (t: Tier) => isKept(t, w.from, p.now, p.retentionMs);
  const fits = TIERS.map((t, i) => (t.ms <= (w.to - w.from) / 24 && kept(t) ? i : -1)).filter((i) => i >= 0);
  if (fits.length) return fits[fits.length - 1]!;
  const finest = TIERS.findIndex(kept);
  return finest >= 0 ? finest : TIERS.length - 1;
}

/** Tier buckets whose weighted sum is the window's totals. Exact where finer tiers are kept at the edges. */
export function planTotals(w: TimeWindow, now: number, retentionMs: number): Segment[] {
  if (w.to <= w.from) return [];
  return cover(w.from, w.to, mainTier(w, { now, retentionMs }), { now, retentionMs });
}

export type SeriesMode = "sql" | "split";

/** The tier for a series, and whether SQL assigns tier buckets by midpoint or TS spreads them by overlap. */
export function planSeries(w: TimeWindow, buckets: number, now: number, retentionMs: number): { tier: Tier; mode: SeriesMode } {
  const page = (w.to - w.from) / buckets;
  const kept = TIERS.filter((t) => isKept(t, w.from, now, retentionMs));
  const usable = kept.length ? kept : [TIERS[TIERS.length - 1]!];
  const fit = usable.filter((t) => t.ms * 4 <= page);
  const tier = fit.length ? fit[fit.length - 1]! : usable[0]!;
  return { tier, mode: page / tier.ms >= 8 ? "sql" : "split" };
}

/** Share of a tier bucket [start, start + ms) that falls in each page bucket, for "split" series. */
export function spreadBucket(start: number, ms: number, w: TimeWindow, buckets: number): { index: number; share: number }[] {
  const size = (w.to - w.from) / buckets;
  const out: { index: number; share: number }[] = [];
  const lo = Math.max(start, w.from);
  const hi = Math.min(start + ms, w.to);
  for (let i = Math.max(0, Math.floor((lo - w.from) / size)); i < buckets && w.from + i * size < hi; i++) {
    const overlap = Math.min(hi, w.from + (i + 1) * size) - Math.max(lo, w.from + i * size);
    if (overlap > 0) out.push({ index: i, share: overlap / ms });
  }
  return out;
}
