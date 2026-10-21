import { describe, expect, it } from "vitest";
import { emptyAgg } from "../scale/agg.js";
import { trafficPoints } from "./traffic.js";
import { wholeCounts, wholeErrors } from "./whole.js";

const sum = (v: readonly number[]) => v.reduce((t, x) => t + x, 0);

describe("whole counts", () => {
  it("rounds the running total, so the counts are whole and keep the total", () => {
    const spread = [10.4, 9.6, 3.5, 3.5, 0.2, 0.3, 0.5];
    const out = wholeCounts(spread);
    expect(out).toEqual([10, 10, 4, 3, 0, 1, 0]);
    expect(sum(out)).toBe(28);
    out.forEach((v, i) => expect(Math.abs(v - spread[i]!)).toBeLessThan(1));
  });

  it("leaves whole counts as they are", () => {
    expect(wholeCounts([3, 0, 7, 1])).toEqual([3, 0, 7, 1]);
  });

  it("never gives a bucket more errors than requests", () => {
    const requests = wholeCounts([0.4, 1.6]);
    const errors = wholeErrors([0.5, 0.5], requests);
    expect(requests).toEqual([0, 2]);
    expect(errors).toEqual([0, 1]);
  });

  it("moves an excess error back when no later bucket has room", () => {
    expect(wholeErrors([0.6, 1.4], [2, 0])).toEqual([2, 0]);
  });
});

describe("traffic points", () => {
  it("shows whole requests and errors, and totals that are their sum", () => {
    const shares = [
      [10.4, 1.2],
      [9.6, 0.8],
      [0.3, 0],
    ];
    const series = shares.map(([n, err]) => ({ ...emptyAgg(), n: n!, err: err!, sum: n! * 20 }));
    const { points, totals } = trafficPoints(series, [0, 1000, 2000]);
    expect(points.map((p) => [p.requests, p.errors])).toEqual([[10, 1], [10, 1], [0, 0]]);
    expect(points[2]!.avgMs).toBeNull();
    expect(points[0]!.avgMs).toBe(20);
    expect(totals).toMatchObject({ requests: 20, errors: 2, errorRatePercent: 10 });
  });
});
