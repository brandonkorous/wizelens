import { describe, expect, it } from "vitest";
import { percentileOf } from "../stats/common.js";
import { relErr } from "../testing/scale-util.js";
import { addHist, binOf, binValue, histCount, histMax, histOf, histPercentile } from "./hist.js";

/** A small seeded random generator, so failures repeat. */
function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);
}

describe("log histogram", () => {
  it("keeps percentiles within 2% of the exact nearest rank", () => {
    const next = rng(7);
    for (let round = 0; round < 20; round++) {
      const values = Array.from({ length: 50 + round * 37 }, () => Math.exp(next() * 12) * 0.05);
      const h = histOf(values);
      for (const p of [1, 25, 50, 75, 90, 95, 99, 100]) {
        expect(relErr(histPercentile(h, values.length, p)!, percentileOf(values, p)!)).toBeLessThanOrEqual(0.02);
      }
      expect(relErr(histMax(h)!, Math.max(...values))).toBeLessThanOrEqual(0.02);
    }
  });

  it("puts zero and tiny values in bin 0 and every value inside its bin", () => {
    expect(binOf(0)).toBe(0);
    expect(binOf(-3)).toBe(0);
    expect(binValue(0)).toBe(0);
    expect(histPercentile(histOf([0, 0, 5]), 3, 50)).toBe(0);
    for (const v of [0.011, 1, 99.9, 1e9]) expect(relErr(binValue(binOf(v)), v)).toBeLessThanOrEqual(0.0196);
    expect(binOf(1e9)).toBeLessThan(700);
  });

  it("adds and takes away counts, dropping empty bins", () => {
    const a = histOf([1, 2, 3]);
    const b = histOf([2, 50]);
    const sum = { ...a };
    addHist(sum, b);
    expect(histCount(sum)).toBe(5);
    addHist(sum, b, -1);
    expect(sum).toEqual(a);
    expect(histPercentile({}, 0, 50)).toBeNull();
    expect(histMax({})).toBeNull();
  });
});
