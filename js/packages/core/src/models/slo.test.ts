import { describe, expect, it } from "vitest";
import { histOf } from "../scale/hist.js";
import { memoryExecutor } from "../scale/memory.js";
import { computePageSync } from "../scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { apdexOf, apdexOfMany, apdexRating } from "./apdex.js";
import { parseApdexTargets, parseSlo } from "./slo-parse.js";
import { type Slo, sloBurnMessage, sloBurnPage, sloContext, sloPage } from "./slo.js";

describe("Apdex", () => {
  it("counts satisfied, tolerating, and frustrated requests, failures as frustrated", () => {
    const a = apdexOf({ n: 4, err: 0, hist: histOf([100, 400, 1500, 9000]) }, 500);
    expect(a).toMatchObject({ satisfied: 2, tolerating: 1, frustrated: 1, score: 0.625 });
    expect(apdexOf({ n: 4, err: 2, hist: histOf([100, 100, 100, 100]) }, 500).score).toBe(0.5);
    expect(apdexOf({ n: 0, err: 0, hist: {} }, 500).score).toBeNull();
    expect(apdexOfMany([a, a])!.score).toBe(0.625);
    expect([apdexRating(0.95), apdexRating(0.4)]).toEqual(["Excellent", "Unacceptable"]);
  });
});

describe("SLOs", () => {
  const ex = memoryExecutor(scenarioTraces());
  const slo = (over: Partial<Slo>): Slo => ({ id: "s", projectId: "", name: "API", service: "api", endpoint: "", kind: "success", target: 99, thresholdMs: 0, windowDays: 30, ...over });
  it("reports good requests, the budget left, and its series over the window", () => {
    const s = computePageSync(sloPage(slo({})), sloContext(30 * 86_400_000, SCENARIO_NOW), ex);
    expect(s.total).toBeGreaterThan(0);
    expect(s.sli!).toBeLessThan(100);
    expect(s.budgetLeft!).toBeLessThan(0);
    expect(s.starts).toHaveLength(48);
    expect(s.budgetSeries.filter((v) => v !== null).at(-1)).toBeCloseTo(s.budgetLeft!, 6);
    const lax = computePageSync(sloPage(slo({ kind: "latency", thresholdMs: 60_000, target: 10 })), sloContext(30 * 86_400_000, SCENARIO_NOW), ex);
    expect(lax.budgetLeft!).toBeGreaterThan(0);
  });

  it("measures the burn rate over a window, and words it", () => {
    const burn = computePageSync(sloBurnPage(slo({})), sloContext(7 * 86_400_000, SCENARIO_NOW), ex);
    expect(burn!).toBeGreaterThan(1);
    expect(sloBurnMessage("API", ">", 14.4, 10, "fired")).toBe("SLO API burns its budget 14.4× as fast as allowed (above 10.0×)");
  });

  it("checks SLOs and Apdex targets from requests", () => {
    expect(parseSlo({ service: "api", kind: "latency", target: 99, windowDays: 7 })).toMatch(/thresholdMs/);
    expect(parseSlo({ service: "api", kind: "success", target: 100 })).toMatch(/below 100/);
    expect(parseSlo({ service: "api", kind: "success", target: 99.9 })).toMatchObject({ name: "api availability", windowDays: 30 });
    expect(parseApdexTargets({ api: 300.4 })).toEqual({ api: 300 });
    expect(parseApdexTargets([1])).toMatch(/Send/);
  });
});
