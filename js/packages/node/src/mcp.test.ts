import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWizeLens } from "./index.js";
import { type Running, startApp } from "./test/helpers.js";

const audit: string[] = [];
const wizelens = createWizeLens({ serviceName: "mcp-api", enabled: true, enableMcp: true, storage: "memory", audit: (l) => audit.push(l) });
const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
let app: Running;

beforeAll(async () => {
  app = await startApp(wizelens, (a) =>
    a.get("/boom", () => {
      throw new Error("kaboom");
    }),
  );
});

afterAll(async () => {
  await wizelens.shutdown();
  await app.close();
});

const rpc = async <T>(id: number, method: string, params: unknown): Promise<T> => {
  const res = await fetch(`${app.base}/_wizelens/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  return (await res.json()) as T;
};

describe("MCP", () => {
  it("lists the read-only tools", async () => {
    const body = await rpc<{ result: { tools: { name: string }[] } }>(1, "tools/list", {});
    expect(body.result.tools.map((t) => t.name).sort()).toEqual(["find_n_plus_one", "find_slow_queries", "get_errors", "get_metric", "get_trace", "list_metrics", "list_tags", "list_traces", "search", "search_fields"]);
  });

  it("calls a tool and writes an audit line", async () => {
    await fetch(`${app.base}/boom`);
    await new Promise((r) => setTimeout(r, 20));
    const body = await rpc<{ result: { content: { text: string }[] } }>(2, "tools/call", { name: "get_errors", arguments: {} });
    expect(body.result.content[0]!.text).toContain("kaboom");
    expect(audit.some((l) => l.includes("tool=get_errors"))).toBe(true);
  });

  it("searches with the search language, and says where a bad search is wrong", async () => {
    await fetch(`${app.base}/boom`);
    await new Promise((r) => setTimeout(r, 20));
    type Call = { result: { content: { text: string }[]; isError?: boolean } };
    const hit = await rpc<Call>(3, "tools/call", { name: "search", arguments: { q: "kaboom error:true", kind: "spans", range: "1h" } });
    const page = JSON.parse(hit.result.content[0]!.text) as { kind: string; items: { name: string; status: string }[] };
    expect(page.kind).toBe("spans");
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((s) => s.name === "GET /boom" && s.status === "error")).toBe(true);
    const bad = await rpc<Call>(4, "tools/call", { name: "search", arguments: { q: "status:nope" } });
    expect(bad.result.isError).toBe(true);
    expect(JSON.parse(bad.result.content[0]!.text)).toMatchObject({ start: 0, end: 11 });
    const fields = await rpc<Call>(5, "tools/call", { name: "search_fields", arguments: { prefix: "stat" } });
    expect(JSON.parse(fields.result.content[0]!.text)[0]).toMatchObject({ value: "status" });
  });

  it("connects like an agent: initialize, the GET stream, tools/list, and a call", async () => {
    const client = new Client({ name: "test-agent", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${app.base}/_wizelens/mcp`)));
    expect((await client.listTools()).tools.map((t) => t.name)).toContain("get_errors");
    expect((await client.callTool({ name: "list_traces", arguments: {} })).isError).toBeFalsy();
    await client.close();
  });

  it("is off unless enabled", async () => {
    const off = createWizeLens({ serviceName: "no-mcp", enabled: true, storage: "memory" });
    const other = await startApp(off, () => {});
    expect((await fetch(`${other.base}/_wizelens/mcp`, { method: "POST", headers, body: "{}" })).status).toBe(404);
    await off.shutdown();
    await other.close();
  });
});
