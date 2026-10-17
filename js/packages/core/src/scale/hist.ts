// Sparse log-bucket histogram: mergeable, subtractable, at most 1.96% relative error on percentiles.

/** Each bin is this much wider than the one before it. */
export const HIST_GAMMA = 1.04;
/** Values at or below this (and zero or negative values) go to bin 0. */
export const HIST_MIN = 0.01;

/** Bin index to count. Counts can be fractional when a bucket is weighted. */
export type Hist = Record<number, number>;

const LOG_GAMMA = Math.log(HIST_GAMMA);

/** Bin of a value: bin i > 0 holds (MIN·γ^(i-1), MIN·γ^i]; 1e9 ms is about bin 646. */
export const binOf = (v: number): number => (v > HIST_MIN ? Math.max(1, Math.ceil(Math.log(v / HIST_MIN) / LOG_GAMMA)) : 0);

/** The value a bin stands for: the point with the same relative distance to both bin edges. */
export const binValue = (b: number): number => (b === 0 ? 0 : (2 * HIST_MIN * HIST_GAMMA ** b) / (1 + HIST_GAMMA));

/** A histogram of some values. */
export function histOf(values: readonly number[]): Hist {
  const h: Hist = {};
  for (const v of values) {
    const b = binOf(v);
    h[b] = (h[b] ?? 0) + 1;
  }
  return h;
}

/** Add (sign 1) or take away (sign -1) the counts of `h`. Bins that reach zero are removed. */
export function addHist(into: Hist, h: Readonly<Hist>, sign: 1 | -1 = 1): void {
  for (const [k, cnt] of Object.entries(h)) {
    const b = Number(k);
    const next = (into[b] ?? 0) + sign * cnt;
    if (Math.abs(next) < 1e-9) delete into[b];
    else into[b] = next;
  }
}

/** Bins in ascending order, with their counts. */
const sortedBins = (h: Readonly<Hist>): [number, number][] =>
  Object.entries(h).map(([k, c]): [number, number] => [Number(k), c]).sort((a, b) => a[0] - b[0]);

/** Sum of the counts. */
export const histCount = (h: Readonly<Hist>): number => Object.values(h).reduce((t, c) => t + c, 0);

/** Nearest-rank percentile like `percentileOf`: p in 0..100 over `n` values. Null when empty. */
export function histPercentile(h: Readonly<Hist>, n: number, p: number): number | null {
  const bins = sortedBins(h).filter(([, c]) => c > 0);
  if (n <= 0 || bins.length === 0) return null;
  const rank = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  let cum = 0;
  for (const [b, c] of bins) {
    cum += c;
    if (cum > rank + 1e-9) return binValue(b);
  }
  return binValue(bins[bins.length - 1]![0]);
}

/** The largest value, as its bin value. Null when empty. */
export function histMax(h: Readonly<Hist>): number | null {
  const bins = sortedBins(h).filter(([, c]) => c > 1e-9);
  return bins.length ? binValue(bins[bins.length - 1]![0]) : null;
}
