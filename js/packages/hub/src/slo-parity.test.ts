import { describe, expect, it } from "vitest";
import { computePage, computePageSync, memoryExecutor, type Slo, sloBurnPage, sloContext, sloPage } from "@wizeworks/lens-core/internal";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { hubExecutor } from "./scale-exec.js";
import { clockStore, settleAll, writeTraces } from "./test/scale.js";

const SLOS: Slo[] = [
  { id: "a", projectId: "", name: "a", service: "api", endpoint: "", kind: "success", target: 99, thresholdMs: 0, windowDays: 30 },
  // 30 days, not 7: a 7-day series spreads hour buckets over its page buckets, so it matches exact times only when every request fails alike.
  { id: "b", projectId: "", name: "b", service: "api", endpoint: "POST /api/pay", kind: "latency", target: 90, thresholdMs: 200, windowDays: 30 },
  { id: "c", projectId: "", name: "c", service: "Web App", endpoint: "", kind: "latency", target: 95, thresholdMs: 1000, windowDays: 30 },
];

describe("SLOs from SQLite", () => {
  it("match the memory executor", async () => {
    const traces = scenarioTraces();
    const { store, clock } = clockStore();
    writeTraces(store, traces);
    settleAll(store, clock);
    const mem = memoryExecutor(traces);
    for (const s of SLOS) {
      const ctx = sloContext(s.windowDays * 86_400_000, SCENARIO_NOW);
      const [want, got] = [computePageSync(sloPage(s), ctx, mem), await computePage(sloPage(s), ctx, hubExecutor(store))];
      expect(got.total).toBe(want.total);
      expect(got.good).toBeCloseTo(want.good, 6);
      expect(got.budgetSeries).toEqual(want.budgetSeries.map((v) => (v === null ? null : expect.closeTo(v, 6))));
      const burnCtx = sloContext(86_400_000, SCENARIO_NOW);
      expect(await computePage(sloBurnPage(s), burnCtx, hubExecutor(store))).toEqual(computePageSync(sloBurnPage(s), burnCtx, mem));
    }
  });
});
