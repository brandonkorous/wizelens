import { describe, expect, it } from "vitest";
import { ALERT_METRICS, alertContext, type AlertMetric, alertPage } from "../models/alerts.js";
import { inWindow } from "../stats/common.js";
import { alertValue } from "../testing/legacy/alerts.js";
import { relErr } from "../testing/scale-util.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { memoryExecutor } from "./memory.js";
import { computePageSync } from "./run.js";

const traces = scenarioTraces();
const ex = memoryExecutor(traces);
const MIN = 60_000;
const WINDOWS = [5 * MIN, 15 * MIN, 60 * MIN, 24 * 60 * MIN, 7 * 24 * 60 * MIN];

describe("parity: alert values", () => {
  it("every trace metric over every window matches `alertValue`", () => {
    for (const windowMs of WINDOWS) {
      const ctx = alertContext(windowMs, SCENARIO_NOW);
      const cur = traces.filter((t) => inWindow(t.startMs, ctx.window));
      const prev = traces.filter((t) => inWindow(t.startMs, ctx.prev));
      for (const metric of Object.keys(ALERT_METRICS) as AlertMetric[]) {
        const want = alertValue(metric, cur, prev, 100);
        const got = computePageSync(alertPage(metric), ctx, ex);
        if (want === null || got === null) expect([metric, windowMs, got]).toEqual([metric, windowMs, want]);
        else expect([metric, windowMs, relErr(got, want) <= (metric === "p95_ms" ? 0.025 : 1e-9)]).toEqual([metric, windowMs, true]);
      }
    }
  });

  it("an empty window has no rates, no p95, and no requests", () => {
    const ctx = alertContext(5 * MIN, SCENARIO_NOW + 365 * 24 * 60 * MIN);
    const value = (m: AlertMetric) => computePageSync(alertPage(m), ctx, ex);
    expect([value("error_rate"), value("p95_ms"), value("avg_ms"), value("requests"), value("new_errors"), value("slow_queries")]).toEqual([null, null, null, 0, 0, 0]);
  });
});
