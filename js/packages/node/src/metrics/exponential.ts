/** The positive or negative buckets of an exponential histogram. */
export interface ExponentialBuckets {
  offset?: number;
  bucketCounts?: readonly number[];
}

export interface ExponentialHistogram {
  scale: number;
  zeroCount?: number;
  positive?: ExponentialBuckets;
  negative?: ExponentialBuckets;
}

/** Exponential buckets as explicit ones: positive bucket i ends at base^(offset+i+1); zero and negative counts go first. */
export function exponentialToExplicit(h: ExponentialHistogram): { bounds: number[]; counts: number[] } {
  const base = 2 ** (2 ** -h.scale);
  const offset = h.positive?.offset ?? 0;
  const positive = (h.positive?.bucketCounts ?? []).map(Number);
  const low = (h.zeroCount ?? 0) + (h.negative?.bucketCounts ?? []).reduce<number>((t, c) => t + Number(c), 0);
  if (positive.length === 0) return { bounds: [], counts: [low] };
  const bounds = Array.from({ length: positive.length + 1 }, (_, i) => base ** (offset + i));
  return { bounds, counts: [low, ...positive, 0] };
}
