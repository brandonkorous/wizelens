import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { settleHub } from "./settle.js";
import { ANOMALY_NOW, anomalyTraces } from "../../core/src/testing/anomaly-scenario.js";
import { post, span, startHub, T1 } from "./test/helpers.js";
import { RETENTION_MS, settleAll, writeTraces } from "./test/scale.js";

let hub: Hub;
afterEach(() => hub?.close());

const headers = { Accept: "application/json, text/event-stream" };
const rpc = (url: string, id: number, method: string, params: unknown) => post(`${url}/_wizelens/mcp`, { jsonrpc: "2.0", id, method, params }, headers);

it("MCP reads traces from every service in the hub", async () => {
  let url: string;
  const audit: string[] = [];
  ({ hub, url } = await startHub({ enableMcp: true, audit: (l) => audit.push(l) }));
  const failed = span(T1, "1".repeat(16), { status: "error", statusMessage: "kaboom", service: "billing", startMs: Date.now() - 1000 });
  await post(`${url}/_wizelens/api/ingest`, { sender: { service: "billing" }, spans: [failed] });
  const res = await rpc(url, 1, "tools/call", { name: "list_traces", arguments: {} });
  const body = (await res.json()) as { result: { content: { text: string }[] } };
  expect(body.result.content[0]!.text).toContain(T1);
  expect(audit.some((l) => l.includes("tool=list_traces") && l.includes("wizelens-hub"))).toBe(true);
});

it("MCP lists and reads metrics", async () => {
  let url: string;
  const audit: string[] = [];
  ({ hub, url } = await startHub({ enableMcp: true, audit: (l) => audit.push(l) }));
  const point = { name: "process.memory.usage", kind: "gauge", unit: "By", value: 2048, timeMs: Date.now() - 30_000 };
  await post(`${url}/_wizelens/api/ingest`, { sender: { service: "billing" }, metrics: [point] });
  const text = async (id: number, name: string, args: unknown) =>
    ((await (await rpc(url, id, "tools/call", { name, arguments: args })).json()) as { result: { content: { text: string }[] } }).result.content[0]!.text;
  expect(await text(1, "list_metrics", {})).toContain('"last": "2.00 KB"');
  expect(await text(2, "get_metric", { name: "process.memory.usage", range: "15m" })).toContain('"groupKeys"');
  expect(audit.filter((l) => l.includes("tool=list_metrics") || l.includes("tool=get_metric"))).toHaveLength(2);
});

it("an agent connects: initialize, the GET stream, tools/list, and a call", async () => {
  let url: string;
  ({ hub, url } = await startHub({ enableMcp: true }));
  await post(`${url}/_wizelens/api/ingest`, { sender: { service: "billing" }, spans: [span(T1, "1".repeat(16), { service: "billing", startMs: Date.now() - 1000 })] });
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/_wizelens/mcp`)));
  expect((await client.listTools()).tools.map((t) => t.name)).toContain("list_traces");
  const res = (await client.callTool({ name: "list_traces", arguments: {} })) as { content: { text: string }[] };
  expect(res.content[0]!.text).toContain(T1);
  await client.close();
});

it("get_overview reports every service: health, traffic, and the top errors", async () => {
  let url: string;
  ({ hub, url } = await startHub({ enableMcp: true }));
  const attrs = { "http.request.method": "GET", "url.path": "/pay", "http.response.status_code": 500 };
  const failed = span(T1, "1".repeat(16), { status: "error", statusMessage: "card declined", service: "billing", startMs: Date.now() - 60_000, attributes: attrs });
  await post(`${url}/_wizelens/api/ingest`, { sender: { service: "billing" }, spans: [failed] });
  settleHub(hub.data.store);
  const res = (await (await rpc(url, 1, "tools/call", { name: "get_overview", arguments: { range: "1h" } })).json()) as { result: { content: { text: string }[] } };
  const report = JSON.parse(res.result.content[0]!.text) as { range: string; requests: { value: number }; services: { name: string; status: string }[]; needsAttention: string[] };
  expect(report.range).toBe("1h");
  expect(report.requests.value).toBe(1);
  expect(report.services).toEqual([expect.objectContaining({ name: "billing", status: "unhealthy" })]);
  expect(report.needsAttention).toEqual(["billing: unhealthy"]);
});

it("list_problems names the spike after a release, with its suspected cause", async () => {
  let url: string;
  const clock = { now: ANOMALY_NOW };
  ({ hub, url } = await startHub({ enableMcp: true, now: () => clock.now, maxAgeMs: RETENTION_MS }));
  writeTraces(hub.data.store, anomalyTraces());
  settleAll(hub.data.store, clock);
  const res = (await (await rpc(url, 1, "tools/call", { name: "list_problems", arguments: { range: "1h" } })).json()) as { result: { content: { text: string }[] } };
  const report = JSON.parse(res.result.content[0]!.text) as { baseline: string; ongoing: number; list: { title: string; suspectedCause: string; otherCauses: string[]; services: string[] }[] };
  expect(report.baseline).toBe("normal is the same hour in earlier weeks (4 with data)");
  expect(report.ongoing).toBe(1);
  expect(report.list[0]).toMatchObject({ title: "Error rate above normal on pay and 2 more", suspectedCause: "pay 2.0.0 was released as it started." });
  expect(report.list[0]!.otherCauses[0]).toBe("A new error in pay: TimeoutError: charge store timed out");
});

it("MCP is off unless enabled", async () => {
  let url: string;
  ({ hub, url } = await startHub());
  expect((await rpc(url, 1, "tools/list", {})).status).toBe(404);
});
