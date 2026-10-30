import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type HostsModel, INFRA_SERVICE, infraDataOf, type KubeModel, type MetricPoint, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core/internal";
import { INFRA_PARAM_SETS, infraModels, infraScenario } from "../../core/src/testing/infra-scenario.js";
import { diffClose, METRIC_NOW } from "../../core/src/testing/metric-scenario.js";
import { hostmetricsExports, kubeExport, podSpanExport } from "../../hub/src/test/collector.js";
import type { Db } from "./db/db.js";
import { createProject } from "./repo/projects.js";
import { writeBatch } from "./repo/trace-write.js";
import type { Cloud } from "./server.js";
import { seedOrg, testDb } from "./test/db.js";
import { setupOwner, startCloud } from "./test/cloud.js";
import { pgTelemetry } from "./telemetry/pg-store.js";
import { tenantScope } from "./telemetry/store.js";

const RANGES = Object.keys(TIME_RANGES) as TimeRange[];
let db: Db;
let org: string;
let cloud: Cloud | undefined;
beforeAll(async () => {
  db = await testDb();
  org = (await seedOrg(db)).orgId;
});
afterAll(() => db.close());
afterEach(async () => cloud?.close());

async function projectWith(points: readonly MetricPoint[]): Promise<string> {
  const { id } = await createProject(db, org, `p${Math.random()}`, 1);
  const byTime = new Map<number, MetricPoint[]>();
  for (const p of points) byTime.set(p.timeMs, [...(byTime.get(p.timeMs) ?? []), p]);
  for (const metrics of byTime.values()) {
    await db.tx((q) => writeBatch(q, id, { sender: { service: INFRA_SERVICE, environment: "prod" }, via: "otlp", spans: [], logs: [], remotes: [], metrics }, METRIC_NOW));
  }
  return id;
}

describe("cloud infrastructure pages in Postgres", () => {
  for (const range of RANGES) {
    it(`answer the Hosts and Kubernetes pages like memory rollups for ${range}`, async () => {
      const points = infraScenario(range, METRIC_NOW, 3);
      const id = await projectWith(points);
      for (const params of INFRA_PARAM_SETS) {
        const sql = infraModels(await pgTelemetry(db).infraData({ scope: tenantScope(org, [id]), env: "prod" }, range, params, METRIC_NOW + 4_000));
        const memory = infraModels(infraDataOf(points, range, METRIC_NOW, params, { tiers: true }));
        expect(diffClose(sql, memory), `${range} ${JSON.stringify(params)}`).toEqual([]);
        if (params.pod) expect(sql.kube.pod?.memory.some((v) => v !== null), range).toBe(true);
      }
      const services = await db.query("SELECT service FROM services WHERE project_id = $1", [id]);
      expect(services).toEqual([]);
    }, 120_000);
  }
});

describe("cloud infrastructure routes", () => {
  it("take collector exports with an ingest key and serve the Hosts and Kubernetes pages", async () => {
    const now = Date.UTC(2026, 9, 19, 12);
    let url: string;
    ({ cloud, url } = await startCloud({ now: () => now }));
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const ingest = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", name: "collector", projectIds: [projectId] })).body.token;
    const send = (path: string, body: unknown) => fetch(`${url}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${ingest}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    for (const body of hostmetricsExports(now - 5_000)) expect((await send("v1/metrics", body)).status).toBe(200);
    expect((await send("v1/metrics", kubeExport(now - 10_000, 1e6))).status).toBe(200);
    expect((await send("v1/traces", podSpanExport(now - 9_000, "0af7651916cd43dd8448eb211c80319c"))).status).toBe(200);
    const hosts = (await owner.call<HostsModel>("GET", `api/models/hosts?project=${projectId}&range=1h`)).body;
    expect(hosts.hosts.map((h) => [h.name, h.cores])).toEqual([["docker-host", 32]]);
    const kube = (await owner.call<KubeModel>("GET", `api/models/kubernetes?project=${projectId}&range=1h&node=kind-worker`)).body;
    expect(kube.summary).toMatchObject({ pods: 2, pending: 1, oomKills: 1 });
    expect(kube.node!.services.map((s) => s.service)).toEqual(["api"]);
    const info = (await owner.call<{ capabilities: string[] }>("GET", "api/info")).body;
    expect(info.capabilities).toContain("infra");
  });
});
