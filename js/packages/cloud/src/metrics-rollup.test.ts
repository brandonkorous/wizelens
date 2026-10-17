import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  METRIC_ALERT_STATS,
  type MetricAlertStat,
  metricAlertDataOf,
  metricAlertValueOf,
  metricDataOf,
  type MetricPoint,
  metricsModelOf,
  TIME_RANGES,
  type TimeRange,
} from "@wizeworks/lens-core";
import { diffClose, METRIC_NOW, metricScenario } from "../../core/src/testing/metric-scenario.js";
import type { Db } from "./db/db.js";
import { loadMetricAlertData } from "./repo/metric-read.js";
import { pruneMetricRollups } from "./repo/metric-write.js";
import { createOrg } from "./repo/orgs.js";
import { createProject } from "./repo/projects.js";
import { writeBatch } from "./repo/trace-write.js";
import { createUser } from "./repo/users.js";
import { projectMetrics } from "./routes/metrics.js";
import { testDb } from "./test/db.js";

const RANGES = Object.keys(TIME_RANGES) as TimeRange[];
let db: Db;
let org: string;
beforeAll(async () => {
  db = await testDb();
  const owner = await createUser(db, "o@x.io", "long enough pw", "O", 1);
  org = (await createOrg(db, "Acme", owner.id, 1)).id;
});
afterAll(() => db.close());

/** A project with the points written in time order, one batch per timestamp. */
async function projectWith(points: readonly MetricPoint[], now = METRIC_NOW): Promise<string> {
  const { id } = await createProject(db, org, `p${Math.random()}`, 1);
  const byTime = new Map<number, MetricPoint[]>();
  for (const p of points) byTime.set(p.timeMs, [...(byTime.get(p.timeMs) ?? []), p]);
  for (const metrics of byTime.values()) {
    await db.tx((q) => writeBatch(q, id, { sender: { service: "api", environment: "prod" }, via: "otlp", spans: [], logs: [], remotes: [], metrics }, now));
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

describe("cloud metric rollups in Postgres", () => {
  for (const range of RANGES) {
    it(`answer the metrics page like memory rollups for ${range}`, async () => {
      const points = metricScenario(range, METRIC_NOW, 3);
      const id = await projectWith(points);
      for (const params of paramSets(points)) {
        const sql = await projectMetrics(db, id, range, params, { now: METRIC_NOW + 4_000, env: "prod" });
        const memory = metricsModelOf(metricDataOf(points, range, METRIC_NOW, params, { tiers: true }));
        expect(diffClose(sql, memory), `${range} ${JSON.stringify(params)}`).toEqual([]);
      }
    });
  }

  it("answers metric alerts like memory rollups, for every metric, stat, and window", async () => {
    const points = metricScenario("24h", METRIC_NOW, 3);
    const id = await projectWith(points);
    for (const ms of [300_000, 3_600_000, 6 * 3_600_000, 24 * 3_600_000]) {
      const w = { from: METRIC_NOW - ms, to: METRIC_NOW };
      for (const name of new Set(points.map((p) => p.name))) {
        const data = await loadMetricAlertData(db, { projectId: id }, name, w, METRIC_NOW);
        const memory = metricAlertDataOf(points.filter((p) => p.name === name), w, METRIC_NOW, { tiers: true });
        for (const stat of Object.keys(METRIC_ALERT_STATS) as MetricAlertStat[]) {
          expect(diffClose(metricAlertValueOf(data, stat), metricAlertValueOf(memory, stat)), `${name} ${stat} ${ms}`).toEqual([]);
        }
      }
      const worker = await loadMetricAlertData(db, { projectId: id, service: "worker" }, "process.cpu.utilization", w, METRIC_NOW);
      const mine = points.filter((p) => p.name === "process.cpu.utilization" && p.service === "worker");
      expect(diffClose(metricAlertValueOf(worker, "avg"), metricAlertValueOf(metricAlertDataOf(mine, w, METRIC_NOW, { tiers: true }), "avg"))).toEqual([]);
    }
  });

  it("drops 1 h buckets past the organization's retention", async () => {
    const id = await projectWith(metricScenario("30d"));
    await db.query("UPDATE orgs SET retention_days = 10 WHERE id = $1", [org]);
    await pruneMetricRollups(db, METRIC_NOW);
    const [row] = await db.query<{ n: string }>("SELECT count(*) AS n FROM metric_1h WHERE project_id = $1 AND bucket_ms < $2", [id, METRIC_NOW - 10 * 86_400_000]);
    expect(Number(row!.n)).toBe(0);
    await db.query("UPDATE orgs SET retention_days = 30 WHERE id = $1", [org]);
  });
});
