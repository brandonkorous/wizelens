import { describe, expect, it } from "vitest";
import { type MetricPoint, metricDataOf, metricsModelOf, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core/internal";
import { diffClose, METRIC_NOW, metricScenario } from "../../core/src/testing/metric-scenario.js";
import { metricsPage } from "./metrics-read.js";
import { HubStore } from "./store.js";

const sender = { service: "api", project: "shop", environment: "prod" };
const RANGES = Object.keys(TIME_RANGES) as TimeRange[];

/** A store with the points written in time order, one batch per timestamp, like collectors send them. */
function storeWith(points: readonly MetricPoint[], clock = { now: METRIC_NOW }): HubStore {
  const store = new HubStore({ path: ":memory:", now: () => clock.now, maxAgeMs: 40 * 86_400_000 });
  const byTime = new Map<number, MetricPoint[]>();
  for (const p of points) byTime.set(p.timeMs, [...(byTime.get(p.timeMs) ?? []), p]);
  for (const batch of byTime.values()) store.write({ sender, via: "otlp", spans: [], logs: [], remotes: [], metrics: batch });
  return store;
}

function paramSets(points: readonly MetricPoint[]): Record<string, string>[] {
  const out: Record<string, string>[] = [{}, { q: "http" }, { service: "worker" }];
  for (const name of new Set(points.map((p) => p.name))) {
    const keys = Object.keys(points.find((p) => p.name === name)!.attributes);
    for (const stat of ["p50", "p99", "avg"]) for (const group of ["", "service", ...keys]) out.push({ metric: name, stat, group });
    out.push({ metric: name, service: "api" });
  }
  return out;
}

describe("hub metric rollups in SQLite", () => {
  for (const range of RANGES) {
    it(`answer the metrics page like memory rollups for ${range}`, () => {
      const points = metricScenario(range, METRIC_NOW, 3);
      const store = storeWith(points);
      for (const params of paramSets(points)) {
        const sql = metricsPage(store.db, range, { project: "shop", env: "prod" }, params, METRIC_NOW + 4_000);
        const memory = metricsModelOf(metricDataOf(points, range, METRIC_NOW, params, { tiers: true }));
        expect(diffClose(sql, memory), `${range} ${JSON.stringify(params)}`).toEqual([]);
        if (range === "1h" || range === "6h" || range === "30d") expect(diffClose(sql, metricsModelOf(metricDataOf(points, range, METRIC_NOW, params)))).toEqual([]);
      }
      store.close();
    });
  }

  it("answers when now is off the tier edges, so the window has weighted edge buckets", () => {
    const points = metricScenario("7d", METRIC_NOW, 3);
    const store = storeWith(points);
    for (const range of ["24h", "7d", "30d"] as const) {
      const page = metricsPage(store.db, range, {}, {}, METRIC_NOW + 1_234_567);
      expect(page.catalog.length, range).toBeGreaterThan(0);
    }
    store.close();
  });

  it("keeps scopes apart and drops tier buckets past their keep", () => {
    const clock = { now: METRIC_NOW };
    const store = storeWith(metricScenario("24h"), clock);
    expect(metricsPage(store.db, "1h", { project: "admin" }, {}, METRIC_NOW).catalog).toEqual([]);
    expect(metricsPage(store.db, "1h", { env: "prod" }, {}, METRIC_NOW).meta.points).toBeGreaterThan(0);
    const count = (t: string) => (store.db.prepare(`SELECT count(*) AS n FROM metric_${t}`).get() as { n: number }).n;
    const before = [count("10s"), count("5m"), count("1h")];
    clock.now += 3_600_000;
    store.prune();
    expect([count("10s") < before[0]!, count("5m"), count("1h")]).toEqual([true, before[1], before[2]]);
    store.close();
  });
});

describe("hub metric rollup writes", () => {
  it("rolls up the raw points of a file from before metric rollups, once", () => {
    const points = metricScenario("24h", METRIC_NOW, 3);
    const store = storeWith([]);
    const raw = store.db.prepare("INSERT INTO metrics (time_ms, project, env, service, name, series_key, json) VALUES (?, 'shop', 'prod', ?, ?, ?, ?)");
    for (const p of points) raw.run(p.timeMs, p.service, p.name, `k${p.name}`, JSON.stringify(p));
    store.prune();
    store.prune();
    for (const range of ["1h", "24h"] as const) {
      const memory = metricsModelOf(metricDataOf(points, range, METRIC_NOW, { metric: "http.requests" }, { tiers: true }));
      expect(diffClose(metricsPage(store.db, range, {}, { metric: "http.requests" }, METRIC_NOW), memory)).toEqual([]);
    }
    expect(store.db.prepare("SELECT value FROM meta WHERE key = 'metric_backfill'").get()).toEqual({ value: "done" });
    store.close();
  });

  it("gives a late point its value but no delta; the next point's delta covers it", () => {
    const at = (min: number, value: number): MetricPoint => ({
      name: "http.requests", kind: "sum", unit: "{request}", service: "api", attributes: {}, monotonic: true, temporality: "cumulative", timeMs: METRIC_NOW - min * 60_000, value,
    });
    const store = storeWith([at(30, 100), at(10, 300)]);
    store.write({ sender, via: "otlp", spans: [], logs: [], remotes: [], metrics: [at(20, 250)] });
    store.write({ sender, via: "otlp", spans: [], logs: [], remotes: [], metrics: [at(5, 360)] });
    const rows = store.db.prepare("SELECT bucket_ms, cnt, rate_delta, rate_ms FROM metric_10s ORDER BY bucket_ms").all();
    expect(rows.map((r) => [r.cnt, r.rate_delta, r.rate_ms])).toEqual([[1, 0, 0], [1, 0, 0], [1, 200, 1_200_000], [1, 60, 300_000]]);
    expect(metricsPage(store.db, "1h", {}, {}, METRIC_NOW).meta.points).toBe(4);
    store.close();
  });
});
