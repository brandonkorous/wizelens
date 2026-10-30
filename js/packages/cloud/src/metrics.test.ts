import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { MetricsModel } from "@wizeworks/lens-core";
import { evaluateAll } from "./alerts/evaluate.js";
import { pruneMetricsByRetention } from "./repo/trace-write.js";
import type { Cloud } from "./server.js";
import { setupOwner, startCloud } from "./test/cloud.js";

const NOW = 1_800_000_000_000;
let cloud: Cloud;
const closers: (() => void)[] = [];
afterEach(async () => {
  closers.splice(0).forEach((c) => c());
  await cloud?.close();
});

const nanos = (msAgo: number) => String(BigInt(NOW - msAgo) * 1_000_000n);
const resource = { attributes: [{ key: "service.name", value: { stringValue: "worker" } }] };
const gauge = (name: string, value: number, msAgo = 60_000) => ({ name, unit: "1", gauge: { dataPoints: [{ timeUnixNano: nanos(msAgo), asDouble: value }] } });
const otlp = (metrics: unknown[]) => ({ resourceMetrics: [{ resource, scopeMetrics: [{ metrics }] }] });

async function withKeys(clock = { now: NOW }) {
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => clock.now, allowPrivateTargets: true, alertIntervalMs: 3_600_000 }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = async (kind: string) => (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind, name: kind, projectIds: [projectId] })).body.token;
  const ingest = await key("ingest");
  const send = (path: string, body: unknown) => fetch(`${url}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${ingest}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { url, owner, orgId, projectId, send, read: await key("read"), clock };
}

describe("cloud metrics", () => {
  it("takes OTLP and add-on metrics with an ingest key and serves the metrics page", async () => {
    const { owner, orgId, projectId, send } = await withKeys();
    expect((await send("v1/metrics", otlp([gauge("process.cpu.utilization", 0.25)]))).status).toBe(200);
    const point = { name: "v8js.memory.heap.used", kind: "gauge", unit: "By", value: 4096, timeMs: NOW - 30_000 };
    expect((await send("_wizelens/api/ingest", { sender: { service: "api" }, metrics: [point] })).status).toBe(204);
    const m = (await owner.call<MetricsModel>("GET", `api/models/metrics?project=${projectId}&range=1h&metric=process.cpu.utilization`)).body;
    expect(m.catalog.map((c) => [c.name, c.services])).toEqual([["process.cpu.utilization", ["worker"]], ["v8js.memory.heap.used", ["api"]]]);
    expect(m.selected).toMatchObject({ name: "process.cpu.utilization", summary: { last: 0.25 } });
    expect(m.runtime.map((r) => r.service)).toEqual(["api", "worker"]);
    const info = (await owner.call<{ capabilities: string[] }>("GET", "api/info")).body;
    expect(info.capabilities).toEqual(expect.arrayContaining(["metrics", "serverMetrics"]));
    expect((await owner.call("POST", `api/orgs/${orgId}/projects/${projectId}/clear`)).status).toBe(200);
    expect((await owner.call<MetricsModel>("GET", `api/models/metrics?project=${projectId}&range=1h`)).body.catalog).toEqual([]);
  });

  it("refuses metrics without an ingest key, and keeps them per organization retention", async () => {
    const { url, projectId, send, owner } = await withKeys();
    expect((await fetch(`${url}/v1/metrics`, { method: "POST", body: JSON.stringify(otlp([])) })).status).toBe(401);
    await send("v1/metrics", otlp([gauge("old.metric", 1, 40 * 86_400_000), gauge("new.metric", 1)]));
    await pruneMetricsByRetention(cloud.app.db, NOW);
    const [row] = await cloud.app.db.query<{ n: number | string }>("SELECT count(*) AS n FROM metric_points WHERE project_id = $1", [projectId]);
    expect(Number(row!.n)).toBe(1);
    expect((await owner.call("GET", `api/models/metrics?project=${projectId}&range=soon`)).status).toBe(400);
  });

  it("serves list_metrics and get_metric over MCP to read keys, audited", async () => {
    const { url, owner, orgId, send, read } = await withKeys();
    await send("v1/metrics", otlp([gauge("process.cpu.utilization", 0.5)]));
    const rpc = async (name: string, args: unknown) => {
      const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${read}` };
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
      const res = (await (await fetch(`${url}/_wizelens/mcp`, { method: "POST", headers, body })).json()) as { result: { content: { text: string }[] } };
      return res.result.content[0]!.text;
    };
    expect(await rpc("list_metrics", { range: "1h" })).toContain('"last": "50.0%"');
    expect(await rpc("get_metric", { name: "process.cpu.utilization", range: "1h" })).toContain('"summary"');
    await new Promise((r) => setTimeout(r, 50));
    const audit = (await owner.call<{ action: string; detail: string }[]>("GET", `api/orgs/${orgId}/audit`)).body;
    expect(audit.filter((a) => a.action === "mcp.call")).toHaveLength(2);
  });
});

/** A webhook receiver on this machine that keeps every body. */
async function receiver(): Promise<{ url: string; bodies: { state: string; message: string }[] }> {
  const bodies: { state: string; message: string }[] = [];
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (c: Buffer) => (text += c.toString()));
    req.on("end", () => (bodies.push(JSON.parse(text)), res.writeHead(200).end()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  closers.push(() => server.close());
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, bodies };
}

describe("metric alerts", () => {
  it("checks the rule, fires on the metric, and resolves", async () => {
    const { owner, projectId, send, clock } = await withKeys({ now: NOW });
    const hook = await receiver();
    const base = { name: "CPU", metric: "metric", op: ">", threshold: 0.8, windowMs: 300_000, channels: [{ kind: "webhook", url: hook.url }] };
    expect((await owner.call<{ error: string }>("POST", `api/projects/${projectId}/alerts`, base)).status).toBe(400);
    expect((await owner.call("POST", `api/projects/${projectId}/alerts`, { ...base, metricName: "process.cpu.utilization", metricStat: "median" })).status).toBe(400);
    const made = await owner.call<{ metric: string; metricName: string; metricStat: string; metricService: string }>("POST", `api/projects/${projectId}/alerts`, {
      ...base,
      metricName: "process.cpu.utilization",
      metricStat: "max",
      metricService: "worker",
    });
    expect(made.body).toMatchObject({ metric: "metric", metricName: "process.cpu.utilization", metricStat: "max", metricService: "worker" });
    await evaluateAll(cloud.app);
    expect(hook.bodies).toEqual([]);
    await send("v1/metrics", otlp([gauge("process.cpu.utilization", 0.95)]));
    await evaluateAll(cloud.app);
    expect(hook.bodies).toEqual([expect.objectContaining({ state: "fired", message: "process.cpu.utilization highest is 95.0% (above 80.0%)" })]);
    clock.now += 600_000;
    await evaluateAll(cloud.app);
    expect(hook.bodies[1]).toMatchObject({ state: "resolved" });
  });
});
