import { describe, expect, it } from "vitest";
import { INFRA_SERVICE, infraDataOf, type MetricPoint, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { INFRA_PARAM_SETS, infraModels, infraScenario } from "../../core/src/testing/infra-scenario.js";
import { diffClose, METRIC_NOW } from "../../core/src/testing/metric-scenario.js";
import { infraData } from "./infra-read.js";
import { HubStore } from "./store.js";

const RANGES = Object.keys(TIME_RANGES) as TimeRange[];
const sender = { service: INFRA_SERVICE, project: "shop", environment: "prod", host: "node-a" };

/** A store with the points written in time order, one batch per timestamp, like collectors send them. */
function storeWith(points: readonly MetricPoint[]): HubStore {
  const store = new HubStore({ path: ":memory:", now: () => METRIC_NOW, maxAgeMs: 40 * 86_400_000 });
  const byTime = new Map<number, MetricPoint[]>();
  for (const p of points) byTime.set(p.timeMs, [...(byTime.get(p.timeMs) ?? []), p]);
  for (const batch of byTime.values()) store.write({ sender, via: "otlp", spans: [], logs: [], remotes: [], metrics: batch });
  return store;
}

describe("hub infrastructure pages in SQLite", () => {
  for (const range of RANGES) {
    it(`answer the Hosts and Kubernetes pages like memory rollups for ${range}`, () => {
      const points = infraScenario(range, METRIC_NOW, 3);
      const store = storeWith(points);
      for (const params of INFRA_PARAM_SETS) {
        const sql = infraModels(infraData(store.db, range, { project: "shop", env: "prod" }, params, METRIC_NOW + 4_000));
        const memory = infraModels(infraDataOf(points, range, METRIC_NOW, params, { tiers: true }));
        expect(diffClose(sql, memory), `${range} ${JSON.stringify(params)}`).toEqual([]);
        if (!params.q) expect(sql.hosts.hosts.length, range).toBe(2);
        if (params.host) expect(sql.hosts.selected?.cpu.some((v) => v !== null), range).toBe(true);
        if (params.pod) expect(sql.kube.pod?.memory.some((v) => v !== null), range).toBe(true);
        if (params.node) expect(sql.kube.node?.cpu.some((v) => v !== null), range).toBe(true);
      }
      store.close();
    });
  }

  it("keeps the collector out of the service registry and other scopes apart", () => {
    const store = storeWith(infraScenario("1h"));
    expect(store.db.prepare("SELECT count(*) AS n FROM services").get()).toEqual({ n: 0 });
    expect(infraModels(infraData(store.db, "1h", { project: "admin" }, {}, METRIC_NOW)).hosts.hosts).toEqual([]);
    store.close();
  });
});
