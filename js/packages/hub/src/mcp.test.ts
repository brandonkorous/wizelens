import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { post, span, startHub, T1 } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

const headers = { Accept: "application/json, text/event-stream" };
const rpc = (url: string, id: number, method: string, params: unknown) => post(`${url}/_wizelens/mcp`, { jsonrpc: "2.0", id, method, params }, headers);

it("MCP reads traces from every service in the hub", async () => {
  let url: string;
  const audit: string[] = [];
  ({ hub, url } = await startHub({ enableMcp: true, audit: (l) => audit.push(l) }));
  const failed = span(T1, "1".repeat(16), { status: "error", statusMessage: "kaboom", service: "billing" });
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

it("MCP is off unless enabled", async () => {
  let url: string;
  ({ hub, url } = await startHub());
  expect((await rpc(url, 1, "tools/list", {})).status).toBe(404);
});
