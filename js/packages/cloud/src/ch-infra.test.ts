import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INFRA_SERVICE, infraDataOf, type MetricPoint, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { INFRA_PARAM_SETS, infraModels, infraScenario } from "../../core/src/testing/infra-scenario.js";
import { diffClose, METRIC_NOW } from "../../core/src/testing/metric-scenario.js";
import { CH_LIMIT, CH_URL, type ChTest, chScope, chTest } from "./test/ch.js";

const RANGES = Object.keys(TIME_RANGES) as TimeRange[];
let t: ChTest;
let n = 0;

/** A project with the points written in time order, one batch per timestamp, as the ingest route does. */
async function projectWith(points: readonly MetricPoint[]): Promise<string> {
  const id = `i${++n}`;
  const byTime = new Map<number, MetricPoint[]>();
  for (const p of points) byTime.set(p.timeMs, [...(byTime.get(p.timeMs) ?? []), p]);
  for (const metrics of byTime.values()) {
    await t.store.write(id, { sender: { service: INFRA_SERVICE, environment: "prod" }, via: "otlp", spans: [], logs: [], remotes: [], metrics }, METRIC_NOW);
  }
  return id;
}

describe.skipIf(!CH_URL)("ClickHouse infrastructure pages", () => {
  beforeAll(async () => (t = await chTest(1000, METRIC_NOW)), CH_LIMIT);
  afterAll(async () => t && (await t.drop()));

  for (const range of RANGES) {
    it(`answer the Hosts and Kubernetes pages like memory rollups for ${range}`, async () => {
      const points = infraScenario(range, METRIC_NOW, 3);
      const id = await projectWith(points);
      for (const params of INFRA_PARAM_SETS) {
        const got = infraModels(await t.store.infraData({ scope: chScope(id), env: "prod" }, range, params, METRIC_NOW + 4_000));
        const memory = infraModels(infraDataOf(points, range, METRIC_NOW, params, { tiers: true }));
        expect(diffClose(got, memory), `${range} ${JSON.stringify(params)}`).toEqual([]);
        if (params.host) expect(got.hosts.selected?.cpu.some((v) => v !== null), range).toBe(true);
      }
    }, CH_LIMIT);
  }
});
