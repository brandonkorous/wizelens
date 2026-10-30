import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { type AlertRule, searchMemory } from "@wizeworks/lens-core/internal";
import { scenarioTraces, SCENARIO_NOW } from "../../core/src/testing/scenario.js";
import { createMcpServer } from "./mcp.js";
import { memoryPages } from "./mcp-memory.js";
import type { McpDataSource, McpProjects } from "./mcp-shared.js";

const traces = scenarioTraces();
const thresholds = { slowQueryMs: 100, nPlusOneThreshold: 5 };
const RULE = { id: "r1", name: "Errors up", state: "firing", enabled: true, channels: [{ kind: "webhook", url: "https://hooks.example.com/secret-path" }], lastEvalMs: SCENARIO_NOW, mutedUntilMs: null } as unknown as AlertRule;

const source = (name = "shop"): McpDataSource => ({
  service: name,
  version: "0",
  ...thresholds,
  audit: () => undefined,
  all: () => [],
  get: async (id) => traces.find((t) => t.traceId === id),
  now: () => SCENARIO_NOW,
  search: (q) => searchMemory(traces, q),
  page: memoryPages(() => traces, thresholds, () => SCENARIO_NOW),
  alerts: async () => ({ rules: [RULE], events: [{ ruleId: "r1", kind: "fired", value: 12, message: "Error rate 12%", timeMs: SCENARIO_NOW }] }),
});

async function connect(data: McpDataSource | McpProjects) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcpServer(data).connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    const text = r.content[0]!.text;
    return { error: !!r.isError, text, body: (/^[[{]/.test(text) ? JSON.parse(text) : null) as never };
  };
  return { client, call };
}

describe("MCP page tools", () => {
  it("reads any dashboard page with its parameters", async () => {
    const { client, call } = await connect(source());
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(["get_page", "get_alerts", "get_overview"]));
    const errors = (await call("get_page", { page: "errors", params: { status: "all" }, range: "7d" })).body as { groups: unknown[] };
    expect(errors.groups.length).toBeGreaterThan(0);
    const user = (await call("get_page", { page: "user", params: { user: "user-9" }, range: "7d" })).body as { totals: { requests: number } };
    expect(user.totals.requests).toBeGreaterThan(0);
    for (const page of ["traffic", "problems", "log-patterns", "insights"]) expect((await call("get_page", { page, range: "7d" })).error).toBe(false);
    expect((await call("get_timeseries", { range: "7d" })).error).toBe(false);
    expect((await call("list_problems", { range: "7d" })).error).toBe(false);
  });

  it("lists alerts without channel secrets", async () => {
    const { call } = await connect(source());
    const r = await call("get_alerts");
    expect(r.body).toMatchObject({ firing: ["Errors up"], rules: [{ name: "Errors up", channels: ["webhook"] }], events: [{ rule: "Errors up", kind: "fired" }] });
    expect(r.text).not.toContain("secret-path");
  });

  it("finds N+1 groups from the stats, or from the traces at another threshold", async () => {
    const { call } = await connect(source());
    type Group = { kind: string; shape: string; requests: number; endpoints: string[] };
    const stats = (await call("find_n_plus_one", { range: "7d" })).body as Group[];
    expect(stats.length).toBeGreaterThan(0);
    expect(stats.find((g) => g.kind === "db")).toMatchObject({ requests: expect.any(Number) });
    const scanned = (await call("find_n_plus_one", { range: "7d", minRepeats: 3 })).body as Group[];
    expect(scanned.length).toBeGreaterThanOrEqual(stats.length);
    expect(scanned.every((g) => g.endpoints.length > 0)).toBe(true);
  });

  it("names a project on a host with several, and says which exist", async () => {
    const many: McpProjects = { service: "hub", version: "0", ...thresholds, metrics: false, overview: true, alerts: true, projects: [{ id: "a", name: "shop" }, { id: "b", name: "blog" }], open: async (id) => source(id), audit: () => undefined };
    const { client, call } = await connect(many);
    expect((await client.listTools()).tools.map((t) => t.name)).toContain("list_projects");
    expect((await call("get_page", { page: "overview", range: "7d" })).text).toContain("blog");
    expect(((await call("get_page", { project: "shop", page: "users", range: "7d" })).body as { total: number }).total).toBeGreaterThan(0);
  });
});
