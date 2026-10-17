import { describe, expect, it } from "vitest";
import { TIME_RANGES, type TimeRange, windowOf } from "../stats/common.js";
import { metricAlertValue as legacyAlert, type MetricAlertStat } from "../testing/legacy-metrics/alert.js";
import { metricsModel as legacyModel } from "../testing/legacy-metrics/model.js";
import { diffClose, METRIC_NOW, metricScenario } from "../testing/metric-scenario.js";
import { METRIC_ALERT_STATS, metricAlertValue, metricAlertValueOf } from "./alert.js";
import { metricAlertDataOf } from "./memory.js";
import { metricsModel } from "./model.js";
import type { MetricPoint } from "./types.js";

const RANGES = Object.keys(TIME_RANGES) as TimeRange[];
const STATS = ["p50", "p95", "p99", "avg"];
const inWindow = (points: MetricPoint[], range: TimeRange) => points.filter((p) => p.timeMs >= METRIC_NOW - TIME_RANGES[range].ms);

/** Every page the dashboard can ask for: the list, search, service, and each metric by stat and grouping. */
function paramSets(points: MetricPoint[], range: TimeRange): Record<string, string>[] {
  const out: Record<string, string>[] = [{}, { q: "http" }, { service: "worker" }, { stat: "p99" }];
  for (const name of [...new Set(points.map((p) => p.name))]) {
    const keys = legacyModel({ points, range, now: METRIC_NOW, params: { metric: name } }).selected?.groupKeys ?? [];
    for (const stat of STATS) for (const group of ["", ...keys]) out.push({ metric: name, stat, group });
    out.push({ metric: name, service: "api" });
  }
  return out;
}

describe("metrics model from rollups vs the raw-point model", () => {
  for (const range of RANGES) {
    it(`gives the same page for ${range}, every metric, group, and stat`, () => {
      const points = inWindow(metricScenario(range), range);
      for (const params of paramSets(points, range)) {
        const want = legacyModel({ points, range, now: METRIC_NOW, params });
        const got = metricsModel({ points, range, now: METRIC_NOW, params });
        expect(diffClose(got, want), JSON.stringify(params)).toEqual([]);
      }
    });
  }

  it("gives the first point of a cumulative series in the window a delta against the point before it", () => {
    const points = metricScenario("1h", METRIC_NOW, 2);
    const params = { metric: "http.requests" };
    const got = metricsModel({ points, range: "1h", now: METRIC_NOW, params }).selected!.lines;
    const want = legacyModel({ points, range: "1h", now: METRIC_NOW, params }).selected!.lines;
    expect(got.map((l) => l.label)).toEqual(want.map((l) => l.label));
    got.forEach((l, i) => expect(diffClose(l.values[0], want[i]!.values[0])).not.toEqual([]));
    expect(diffClose(got.map((l) => l.values.slice(1)), want.map((l) => l.values.slice(1)))).toEqual([]);
  });
});

describe("metric alert values from rollups vs raw points", () => {
  const windows = [300_000, 3_600_000, 6 * 3_600_000, 24 * 3_600_000];
  it("match for every metric, stat, and window", () => {
    for (const ms of windows) {
      const w = { from: METRIC_NOW - ms, to: METRIC_NOW };
      const points = metricScenario("24h").filter((p) => p.timeMs >= w.from);
      for (const name of new Set(points.map((p) => p.name))) {
        const mine = points.filter((p) => p.name === name);
        for (const stat of Object.keys(METRIC_ALERT_STATS) as MetricAlertStat[]) {
          expect(diffClose(metricAlertValue(mine, w, stat), legacyAlert(mine, w, stat)), `${name} ${stat} ${ms}`).toEqual([]);
        }
      }
    }
  });

  it("reads gauge p95 and p99 from tier bucket means within a few percent", () => {
    for (const range of ["1h", "6h", "24h"] as const) {
      const w = windowOf(range, METRIC_NOW);
      const points = metricScenario(range).filter((p) => p.name === "process.cpu.utilization" && p.timeMs >= w.from);
      for (const stat of ["p95", "p99"] as const) {
        const exact = legacyAlert(points, w, stat)!;
        const tiered = metricAlertValueOf(metricAlertDataOf(points, w, METRIC_NOW, { tiers: true }), stat)!;
        expect(Math.abs(tiered - exact) / exact, `${range} ${stat}`).toBeLessThan(0.05);
      }
    }
  });
});
