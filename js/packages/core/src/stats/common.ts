// Shared helpers for dashboard statistics: time windows, buckets, averages, and change.

export type TimeRange = "15m" | "1h" | "6h" | "24h" | "7d" | "30d";

export const TIME_RANGES: Record<TimeRange, { ms: number; label: string }> = {
  "15m": { ms: 15 * 60_000, label: "Last 15 minutes" },
  "1h": { ms: 60 * 60_000, label: "Last hour" },
  "6h": { ms: 6 * 60 * 60_000, label: "Last 6 hours" },
  "24h": { ms: 24 * 60 * 60_000, label: "Last 24 hours" },
  "7d": { ms: 7 * 24 * 60 * 60_000, label: "Last 7 days" },
  "30d": { ms: 30 * 24 * 60 * 60_000, label: "Last 30 days" },
};

/** Ranges a host can serve from traces in the browser. Longer ones need server-side stats. */
export const BROWSER_MAX_RANGE_MS = 24 * 60 * 60_000;

/** "vs. previous hour" and so on, for the stat cards. */
export const COMPARE_LABEL: Record<TimeRange, string> = {
  "15m": "vs. previous 15 min",
  "1h": "vs. previous hour",
  "6h": "vs. previous 6 hours",
  "24h": "vs. previous day",
  "7d": "vs. previous 7 days",
  "30d": "vs. previous 30 days",
};

/** Own keys only, so "constructor" and other prototype names are not ranges. */
export const isTimeRange = (v: string): v is TimeRange => Object.hasOwn(TIME_RANGES, v);

/** A time span [from, to) in epoch ms. */
export interface TimeWindow {
  from: number;
  to: number;
}

/** Impact of an issue, shown as High / Medium / Low. */
export type Impact = "high" | "medium" | "low";

export const windowOf = (range: TimeRange, now: number): TimeWindow => ({ from: now - TIME_RANGES[range].ms, to: now });

/** The window of the same length right before `w`, for "vs. previous period". */
export const previousWindow = (w: TimeWindow): TimeWindow => ({ from: w.from - (w.to - w.from), to: w.from });

export const inWindow = (timeMs: number, w: TimeWindow): boolean => timeMs >= w.from && timeMs < w.to;

/** Index of the bucket that holds `timeMs`, or -1 when outside the window. */
export function bucketIndex(timeMs: number, w: TimeWindow, buckets: number): number {
  if (!inWindow(timeMs, w)) return -1;
  return Math.min(buckets - 1, Math.floor(((timeMs - w.from) / (w.to - w.from)) * buckets));
}

/** Start time of every bucket. */
export function bucketStarts(w: TimeWindow, buckets: number): number[] {
  const size = (w.to - w.from) / buckets;
  return Array.from({ length: buckets }, (_, i) => w.from + i * size);
}

export type Aggregate = "count" | "sum" | "avg";

/** Values per bucket. With "avg", empty buckets are null. */
export function series<T>(
  items: readonly T[],
  timeOf: (t: T) => number,
  w: TimeWindow,
  buckets: number,
  agg: Aggregate = "count",
  valueOf: (t: T) => number = () => 1,
): (number | null)[] {
  const sums = new Array<number>(buckets).fill(0);
  const counts = new Array<number>(buckets).fill(0);
  for (const item of items) {
    const i = bucketIndex(timeOf(item), w, buckets);
    if (i < 0) continue;
    sums[i]! += valueOf(item);
    counts[i]!++;
  }
  if (agg === "count") return counts;
  if (agg === "sum") return sums;
  return sums.map((s, i) => (counts[i] ? s / counts[i]! : null));
}

export const sumOf = (values: readonly number[]): number => values.reduce((t, v) => t + v, 0);

export const avgOf = (values: readonly number[]): number | null => (values.length ? sumOf(values) / values.length : null);

/** Nearest-rank percentile, p in 0..100. Null for no values. */
export function percentileOf(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]!;
}

/** Change from `previous` to `current` in percent. Null when there is nothing to compare with. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Ratio as a percent (0..100). Zero when the total is zero. */
export const percentOf = (part: number, total: number): number => (total > 0 ? (part / total) * 100 : 0);

/** Group items by a key. Keeps the order of first appearance. */
export function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Cache one derived value per object. Recomputed when the object changes identity. */
export function memoByObject<K extends object, V>(compute: (k: K) => V): (k: K) => V {
  const cache = new WeakMap<K, V>();
  return (k) => {
    if (cache.has(k)) return cache.get(k) as V;
    const v = compute(k);
    cache.set(k, v);
    return v;
  };
}

// A bare GUID, or a long hex id with a digit (a Mongo ObjectId, a hash), as in the Redis key "session:3f2a...".
const BARE_ID_RE = /\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[0-9a-f]*\d)[0-9a-f]{16,})\b/gi;

/** SQL text (or a command such as `GET user:123`) with literals and ids replaced by `?`, so the same query with other values groups together. */
export function normalizeQuery(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "?")
    .replace(BARE_ID_RE, "?")
    .replace(/\b\d+(?:\.\d+)?\b/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}
