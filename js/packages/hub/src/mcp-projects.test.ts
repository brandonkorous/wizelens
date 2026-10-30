import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { settleHub } from "./settle.js";
import { post, span, startHub, T1, T2 } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

const headers = { Accept: "application/json, text/event-stream" };

it("MCP on a hub with several projects: list_projects, a project on each tool, pages, and alerts", async () => {
  let url: string;
  ({ hub, url } = await startHub({ mcp: true }));
  const now = Date.now();
  await post(`${url}/_wizelens/api/ingest`, { sender: { service: "api", project: "shop" }, spans: [span(T1, "1".repeat(16), { startMs: now - 60_000, attributes: { "http.request.method": "GET", "url.path": "/orders", "enduser.id": "u-1" } })] });
  await post(`${url}/_wizelens/api/ingest`, { sender: { service: "api", project: "blog" }, spans: [span(T2, "2".repeat(16), { startMs: now - 60_000 })] });
  await post(`${url}/_wizelens/api/alerts?project=shop`, { name: "Slow", metric: "error_rate", op: ">", threshold: 10, windowMs: 300_000, channels: [{ kind: "webhook", url: "https://hooks.example.com/hidden" }] });
  settleHub(hub.data.store, { budgetMs: Infinity });
  let id = 0;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await post(`${url}/_wizelens/mcp`, { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, headers);
    return ((await res.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text;
  };
  expect(JSON.parse(await call("list_projects"))).toEqual([{ id: "blog", name: "blog" }, { id: "shop", name: "shop" }]);
  expect(await call("list_traces")).toContain("Add the project argument");
  expect(await call("list_traces", { project: "blog" })).toContain(T2);
  expect(await call("list_traces", { project: "blog" })).not.toContain(T1);
  expect(await call("get_page", { project: "shop", page: "users", range: "1h" })).toContain('"u-1"');
  expect(await call("get_page", { project: "blog", page: "users", range: "1h" })).not.toContain('"u-1"');
  const alerts = await call("get_alerts", { project: "shop" });
  expect(alerts).toContain('"Slow"');
  expect(alerts).not.toContain("hidden");
}, 30_000);
