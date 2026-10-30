import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { METRIC_ALERT_STATS, type MetricAlertStat, metricAlertDataOf, metricAlertValueOf, metricDataOf, type MetricPoint, metricsModelOf, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core/internal";
import { diffClose, METRIC_NOW, metricScenario } from "../../core/src/testing/metric-scenario.js";
import { projectMetrics } from "./routes/metrics.js";
import { CH_LIMIT, CH_URL, type ChTest, chScope, chTest } from "./test/ch.js";

const RANGES = Object.keys(TIME_RANGES) as TimeRange[];
let t: ChTest;
let n = 0;

/** A project with the points written in time order, one batch per timestamp, as the ingest route does. */
async function projectWith(points: readonly MetricPoint[]): Promise<string> {
  const id = `m${++n}`;
  const byTime = new Map<number, MetricPoint[]>();
  for (const p of points) byTime.set(p.timeMs, [...(byTime.get(p.timeMs) ?? []), p]);
  for (const metrics of byTime.values()) {
    await t.store.write(id, { sender: { service: "api", environment: "prod" }, via: "otlp", spans: [], logs: [], remotes: [], metrics }, METRIC_NOW);
  }
  return id;
}

function paramSets(points: readonly MetricPoint[]): Record<string, string>[] {
  const out: Record<string, string>[] = [{}, { q: "http" }, { service: "worker" }];
  for (const name of new Set(points.map((p) => p.name))) {
    const keys = Object.keys(points.find((p) => p.name === name)!.attributes);
    for (const group of ["", "service", ...keys]) out.push({ metric: name, stat: "p99", group });
    out.push({ metric: name, service: "api", stat: "avg" });
  }
  return out;
}

describe.skipIf(!CH_URL)("ClickHouse metric rollups", () => {
  beforeAll(async () => (t = await chTest(1000, METRIC_NOW)), CH_LIMIT);
  afterAll(async () => t && (await t.drop()));

  for (const range of RANGES) {
    it(`answer the metrics page like memory rollups for ${range}`, async () => {
      const points = metricScenario(range, METRIC_NOW, 3);
      const id = await projectWith(points);
      for (const params of paramSets(points)) {
        const got = await projectMetrics(t.store, chScope(id), range, params, { now: METRIC_NOW + 4_000, env: "prod" });
        const memory = metricsModelOf(metricDataOf(points, range, METRIC_NOW, params, { tiers: true }));
        expect(diffClose(got, memory), `${range} ${JSON.stringify(params)}`).toEqual([]);
      }
    }, CH_LIMIT);
  }

  it("answers metric alerts like memory rollups, for every metric, stat, and window", async () => {
    const points = metricScenario("24h", METRIC_NOW, 3);
    const id = await projectWith(points);
    for (const ms of [300_000, 3_600_000, 6 * 3_600_000, 24 * 3_600_000]) {
      const w = { from: METRIC_NOW - ms, to: METRIC_NOW };
      for (const name of new Set(points.map((p) => p.name))) {
        const data = await t.store.metricAlertData({ scope: chScope(id) }, name, w, METRIC_NOW);
        const memory = metricAlertDataOf(points.filter((p) => p.name === name), w, METRIC_NOW, { tiers: true });
        for (const stat of Object.keys(METRIC_ALERT_STATS) as MetricAlertStat[]) {
          expect(diffClose(metricAlertValueOf(data, stat), metricAlertValueOf(memory, stat)), `${name} ${stat} ${ms}`).toEqual([]);
        }
      }
    }
  }, CH_LIMIT);
});
