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

it("MCP is off unless enabled", async () => {
  let url: string;
  ({ hub, url } = await startHub());
  expect((await rpc(url, 1, "tools/list", {})).status).toBe(404);
});
