// Contributions (what one item adds to a rollup) and aggregates (what a rollup row holds).
import { addHist, type Hist, histOf } from "./hist.js";
import { COUNTER_SLOTS, type KindSpec, type RollupKind } from "./kinds.js";

/** What one item (a request, a span, a log line) adds to one rollup group. */
export interface Contribution {
  kind: RollupKind;
  key: string;
  /** Time of the item itself, which decides its window and bucket. */
  timeMs: number;
  n: number;
  err: number;
  sum: number;
  /** Counters c0..c5; missing slots are 0. */
  c?: number[];
  /** Values for the histogram, only for kinds that keep one. */
  values?: number[];
  /** Representative item; rank is its time ("newest") or its measure ("largest"). */
  top?: { rank: number; data: unknown };
}

/** A rollup row, or many summed. n, err, sum, c, and hist add and subtract; the rest is for display. */
export interface Agg {
  n: number;
  err: number;
  sum: number;
  c: number[];
  /** Null when the kind keeps no histogram, or it was not asked for. */
  hist: Hist | null;
  /** Earliest and latest item time. Infinity and -Infinity while empty. */
  firstMs: number;
  lastMs: number;
  top: unknown;
  topRank: number;
  /** Newest trace ids first. */
  ids: string[];
}

/** One item's contribution: n = 1 and nothing else unless given. */
export const contribution = (kind: RollupKind, key: string, timeMs: number, over: Partial<Contribution> = {}): Contribution => ({ kind, key, timeMs, n: 1, err: 0, sum: 0, ...over });

export const zeroCounters = (): number[] => new Array<number>(COUNTER_SLOTS).fill(0);

/** An empty aggregate; pass true for kinds that keep a histogram. */
export const emptyAgg = (hist = false): Agg => ({
  n: 0,
  err: 0,
  sum: 0,
  c: zeroCounters(),
  hist: hist ? {} : null,
  firstMs: Infinity,
  lastMs: -Infinity,
  top: null,
  topRank: -Infinity,
  ids: [],
});

function addIds(a: Agg, ids: readonly string[], newer: boolean, cap: number): void {
  if (cap <= 0) return;
  const merged = newer ? [...ids, ...a.ids] : [...a.ids, ...ids];
  a.ids = [...new Set(merged)].slice(0, cap);
}

/** Add one item to an aggregate, in place. */
export function addContribution(a: Agg, c: Contribution, traceId: string, spec: KindSpec): void {
  const newer = c.timeMs >= a.lastMs;
  a.n += c.n;
  a.err += c.err;
  a.sum += c.sum;
  c.c?.forEach((v, i) => (a.c[i] = (a.c[i] ?? 0) + v));
  if (spec.hist && c.values?.length) addHist((a.hist ??= {}), histOf(c.values));
  a.firstMs = Math.min(a.firstMs, c.timeMs);
  a.lastMs = Math.max(a.lastMs, c.timeMs);
  if (spec.top && c.top && c.top.rank > a.topRank) Object.assign(a, { top: c.top.data, topRank: c.top.rank });
  addIds(a, [traceId], newer, spec.ids);
}

/** The sum of two aggregates. Display fields keep the earliest, latest, top-ranked, and newest ids. */
export function mergeAgg(a: Agg, b: Agg, spec: KindSpec): Agg {
  const out: Agg = { ...a, c: a.c.map((v, i) => v + (b.c[i] ?? 0)), ids: [...a.ids] };
  out.n += b.n;
  out.err += b.err;
  out.sum += b.sum;
  if (a.hist || b.hist) {
    out.hist = { ...(a.hist ?? {}) };
    addHist(out.hist, b.hist ?? {});
  }
  out.firstMs = Math.min(a.firstMs, b.firstMs);
  out.lastMs = Math.max(a.lastMs, b.lastMs);
  if (b.topRank > a.topRank) Object.assign(out, { top: b.top, topRank: b.topRank });
  addIds(out, b.ids, b.lastMs > a.lastMs, spec.ids);
  return out;
}

/** `a` minus `b` for n, err, sum, c, and hist. Display fields stay as in `a`. */
export function subtractAgg(a: Agg, b: Agg): Agg {
  const out: Agg = { ...a, c: a.c.map((v, i) => v - (b.c[i] ?? 0)), ids: [...a.ids] };
  out.n -= b.n;
  out.err -= b.err;
  out.sum -= b.sum;
  if (a.hist) {
    out.hist = { ...a.hist };
    addHist(out.hist, b.hist ?? {}, -1);
  }
  return out;
}

export const avgOfAgg = (a: Pick<Agg, "n" | "sum">): number | null => (a.n ? a.sum / a.n : null);

/** Keep only what a need asked for, so the memory and SQL executors return the same shape. */
export function trimAgg(a: Agg, keep: { hist?: boolean; top?: boolean; ids?: boolean; times?: boolean }): Agg {
  const times = keep.times !== false && a.n > 0;
  return {
    n: a.n,
    err: a.err,
    sum: a.sum,
    c: [...a.c],
    hist: keep.hist && a.hist ? a.hist : null,
    firstMs: times ? a.firstMs : 0,
    lastMs: times ? a.lastMs : 0,
    top: keep.top ? a.top : null,
    topRank: keep.top && a.top !== null ? a.topRank : 0,
    ids: keep.ids ? a.ids : [],
  };
}
