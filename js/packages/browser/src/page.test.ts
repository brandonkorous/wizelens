import { describe, expect, it } from "vitest";
import { clsFromShifts, navigationBreakdown } from "./page.js";

describe("page stats", () => {
  it("splits a navigation into server, network, and browser time", () => {
    const nav = { startTime: 0, requestStart: 30, responseStart: 210, responseEnd: 240, loadEventEnd: 600 };
    expect(navigationBreakdown(nav)).toEqual({ totalMs: 600, serverMs: 180, networkMs: 60, browserMs: 360 });
  });

  it("waits for the load event", () => {
    expect(navigationBreakdown({ startTime: 0, requestStart: 1, responseStart: 2, responseEnd: 3, loadEventEnd: 0 })).toBeNull();
  });

  it("takes the largest burst of layout shifts", () => {
    expect(clsFromShifts([])).toBe(0);
    // Burst 1: 0.05 + 0.05. Gap > 1 s. Burst 2: 0.02 + 0.03 + 0.04.
    const cls = clsFromShifts([
      { startTime: 100, value: 0.05 },
      { startTime: 500, value: 0.05 },
      { startTime: 3000, value: 0.02 },
      { startTime: 3500, value: 0.03 },
      { startTime: 4000, value: 0.04 },
    ]);
    expect(cls).toBeCloseTo(0.1);
  });
});
