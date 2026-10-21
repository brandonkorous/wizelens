// Whole counts for a series that spread a coarse rollup bucket over several page buckets.

/** Rounds the running total, so each count is whole, within 1 of its exact share, and all add up to the rounded total. */
export function wholeCounts(values: readonly number[]): number[] {
  let exact = 0;
  let shown = 0;
  return values.map((v) => {
    exact += v;
    const next = Math.round(exact);
    const out = next - shown;
    shown = next;
    return out;
  });
}

/** Whole errors that never pass their bucket's whole requests: an excess moves to the next bucket with room, then back. */
export function wholeErrors(errors: readonly number[], requests: readonly number[]): number[] {
  const out = wholeCounts(errors);
  let extra = 0;
  const fit = (i: number) => {
    const want = out[i]! + extra;
    out[i] = Math.min(want, requests[i]!);
    extra = want - out[i]!;
  };
  for (let i = 0; i < out.length; i++) fit(i);
  for (let i = out.length - 1; i >= 0 && extra > 0; i--) fit(i);
  return out;
}
