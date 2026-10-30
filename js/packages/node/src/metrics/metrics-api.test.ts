import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { IngestBatch, MetricPoint, ServiceInfo } from "@wizeworks/lens-core/internal";
import { metricsOf } from "../adapters/registry.js";
import { HubExporter } from "../hub-export.js";
import { type Running, startApp } from "../test/helpers.js";
import { createWizeLens } from "../wizelens.js";
import { MetricStore } from "./store.js";

const wl = createWizeLens({ service: "metrics-api", storage: "memory", instrumentFetch: false, mcp: true, audit: () => {} });
const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
let app: Running;
const now = Date.now();

beforeAll(async () => {
  app = await startApp(wl, () => {});
  metricsOf(wl)!.add([
    { name: "process.memory.usage", kind: "gauge", unit: "By", value: 64 * 1024 * 1024, timeMs: now - 60_000 },
    { name: "process.memory.usage", kind: "gauge", unit: "By", value: 80 * 1024 * 1024, timeMs: now - 30_000 },
  ]);
});
afterAll(async () => {
  await wl.shutdown();
  await app.close();
});

const tool = async (name: string, args: Record<string, unknown>) => {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const res = await fetch(`${app.base}/_wizelens/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
  return JSON.parse(((await res.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text);
};

describe("metrics API", () => {
  it("serves points since a time, and says it has metrics", async () => {
    const all = (await (await fetch(`${app.base}/_wizelens/api/metrics/points`)).json()) as { points: MetricPoint[] };
    expect(all.points.map((p) => p.value)).toEqual([64 * 1024 * 1024, 80 * 1024 * 1024]);
    const recent = (await (await fetch(`${app.base}/_wizelens/api/metrics/points?since=${now - 45_000}`)).json()) as { points: MetricPoint[] };
    expect(recent.points).toHaveLength(1);
    const info = (await (await fetch(`${app.base}/_wizelens/api/info`)).json()) as ServiceInfo;
    expect(info.capabilities).toContain("metrics");
  });

  it("answers the MCP metric tools", async () => {
    const list = await tool("list_metrics", {});
    expect(list.metrics).toEqual([expect.objectContaining({ name: "process.memory.usage", last: "80.0 MB" })]);
    expect(list.runtime[0].stats.Memory).toBe("80.0 MB");
    const one = await tool("get_metric", { name: "process.memory.usage", range: "15m" });
    expect(one.summary.max).toBe("80.0 MB");
    expect(one.lines[0].points.length).toBeLessThanOrEqual(12);
  });

  it("is off with captureMetrics: false and on a disabled instance", async () => {
    const off = createWizeLens({ service: "off", storage: "memory", instrumentFetch: false, captureMetrics: false });
    expect(metricsOf(off)).toBeNull();
    await off.shutdown();
    expect(metricsOf(createWizeLens({ service: "x", enabled: false }))).toBeNull();
  });
});

describe("hub exporter metrics", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => void (globalThis.fetch = realFetch));

  it("sends metric points in the batch and keeps them while the hub is down", async () => {
    const batches: IngestBatch[] = [];
    let ok = false;
    globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      batches.push(JSON.parse(String(init!.body)) as IngestBatch);
      return new Response(null, { status: ok ? 204 : 503 });
    }) as typeof fetch;
    const clock = { now: 0 };
    const e = new HubExporter({ url: "http://hub", sender: () => ({ service: "api" }), now: () => clock.now });
    const store = new MetricStore({ service: "api", redactKeys: [], now: () => 1000 });
    e.attachMetrics(store);
    store.add([{ name: "a", kind: "gauge", value: 1, timeMs: 900 }]);
    await e.tick();
    expect(e.queued).toBe(1);
    ok = true;
    clock.now = 60_000;
    await e.tick();
    expect(batches[1]!.metrics).toEqual([expect.objectContaining({ name: "a", service: "api", value: 1 })]);
    expect(e.queued).toBe(0);
  });
});
