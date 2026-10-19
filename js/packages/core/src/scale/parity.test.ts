import { describe, expect, it } from "vitest";
import { inWindow } from "../stats/common.js";
import { errorEvents } from "../stats/errors.js";
import { newModel, PARITY_RANGES, parityOf } from "../testing/parity.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { pageContext } from "./run.js";

const traces = scenarioTraces();
const inRange = (range: (typeof PARITY_RANGES)[number]) => traces.filter((t) => inWindow(t.startMs, pageContext(range, SCENARIO_NOW, {}).window));
const curIds = (range: (typeof PARITY_RANGES)[number]) => inRange(range).map((t) => t.traceId);

describe("parity: overview, traces, insights", () => {
  it("overview matches the legacy model", () => {
    for (const range of PARITY_RANGES) expect(parityOf("overview", range)).toEqual([]);
  });

  it("traces matches, with search and a selected trace", () => {
    for (const range of PARITY_RANGES) {
      const ids = curIds(range);
      const prev = traces.find((t) => inWindow(t.startMs, pageContext(range, SCENARIO_NOW, {}).prev));
      const list: Record<string, string>[] = [{}, { q: "checkout" }, { q: ids[3]!.slice(0, 7) }, { q: "nothing-matches" }, { trace: ids[2]! }, { trace: prev?.traceId ?? "" }, { trace: "f".repeat(32) }];
      for (const params of list) {
        // Legacy: 10 traces, and the newest trace of all shown; now pages of 15, and a search shows its first match.
        const skip = params.q && !params.trace ? ["selected"] : [];
        expect(parityOf("traces", range, { size: "10", ...params }, skip)).toEqual([]);
      }
    }
  });

  it("insights matches, with every filter and a selected key", () => {
    for (const range of PARITY_RANGES) {
      const keys = (newModel("insights", range).groups ?? []).map((g) => g.key);
      expect(keys.length).toBeGreaterThan(0);
      const params: Record<string, string>[] = [{}, { area: "database" }, { area: "http" }, { area: "render" }, { impact: "high" }, { impact: "medium" }, { impact: "low" }, { q: "orders" }, { key: keys[0]! }, { key: keys[keys.length - 1]! }];
      for (const p of params) expect(parityOf("insights", range, p)).toEqual([]);
    }
  });

  it("badges count the exceptions of the range", () => {
    for (const range of PARITY_RANGES) expect(newModel("badges", range).errors).toBe(errorEvents(inRange(range)).length);
  });
});
