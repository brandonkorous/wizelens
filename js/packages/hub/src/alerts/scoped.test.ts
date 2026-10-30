import { describe, expect, it } from "vitest";
import { ALERT_METRICS, alertContext, type AlertMetric, alertPage, alertScopeProblem, computePage, computePageSync, memoryExecutor } from "@wizeworks/lens-core/internal";
import { SCENARIO_NOW, scenarioTraces } from "../../../core/src/testing/scenario.js";
import { hubExecutor } from "../scale-exec.js";
import { clockStore, settleAll, writeTraces } from "../test/scale.js";

const SCOPES = [{}, { service: "api" }, { service: "Web App" }, { service: "api", endpoint: "POST /api/pay" }, { service: "orders", endpoint: "nope" }];

describe("scoped alert values", () => {
  it("are the same from SQLite as from memory, for every metric and scope", async () => {
    const traces = scenarioTraces();
    const { store, clock } = clockStore();
    writeTraces(store, traces);
    settleAll(store, clock);
    const mem = memoryExecutor(traces);
    const diffs: string[] = [];
    for (const windowMs of [3_600_000, 86_400_000, 7 * 86_400_000]) {
      const ctx = alertContext(windowMs, SCENARIO_NOW);
      for (const metric of Object.keys(ALERT_METRICS) as AlertMetric[]) {
        for (const scope of SCOPES.filter((s) => !alertScopeProblem(metric, s))) {
          const [want, got] = [computePageSync(alertPage(metric, scope), ctx, mem), await computePage(alertPage(metric, scope), ctx, hubExecutor(store))];
          const close = want === got || (want !== null && got !== null && Math.abs(want - got) <= Math.abs(want) * 0.025);
          if (!close) diffs.push(`${metric} ${JSON.stringify(scope)} ${windowMs}: ${want} != ${got}`);
        }
      }
    }
    expect(diffs).toEqual([]);
  });
});
