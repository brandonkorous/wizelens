import { describe, expect, it } from "vitest";
import { parseSearch, type SearchQuery, searchMemory, type Trace } from "@wizeworks/lens-core";
import { scenarioTraces, SCENARIO_NOW } from "../../core/src/testing/scenario.js";
import { DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS } from "./info.js";
import type { McpDataSource } from "./mcp-shared.js";
import { allOf, findAll } from "./mcp-store.js";

const traces = scenarioTraces();

/** A host whose store holds `stored` and whose memory holds `recent`; the store answers in pages of 3. */
function host(stored: readonly Trace[], recent: readonly Trace[], pages: number[] = []): McpDataSource {
  return {
    service: "test", version: "0", slowQueryMs: DEFAULT_SLOW_QUERY_MS, nPlusOneThreshold: DEFAULT_N_PLUS_ONE, audit: () => undefined,
    all: () => [...recent],
    get: async (id) => traces.find((t) => t.traceId === id),
    now: () => SCENARIO_NOW,
    search: (q: SearchQuery) => (pages.push(q.limit), searchMemory([...stored], { ...q, limit: Math.min(q.limit, 3) })),
  };
}

describe("MCP tools on the store", () => {
  it("read every page of the store, newest first", async () => {
    const pages: number[] = [];
    const got = await findAll(host(traces, [], pages), "traces", null, "30d", 10);
    const want = searchMemory(traces, { kind: "traces", node: null, window: { from: SCENARIO_NOW - 30 * 86_400_000, to: SCENARIO_NOW }, limit: 10 }).items;
    expect(got.map((t) => t.traceId)).toEqual(want.map((t) => t.traceId));
    expect(pages.length).toBeGreaterThan(1);
  });

  it("add the newest traces the store has not indexed yet, once each", async () => {
    const [fresh, ...settled] = [...traces].sort((a, b) => b.startMs - a.startMs);
    const got = await findAll(host(settled, [fresh!, settled[0]!]), "traces", null, "30d", 5);
    expect(got[0]!.traceId).toBe(fresh!.traceId);
    expect(new Set(got.map((t) => t.traceId)).size).toBe(got.length);
  });

  it("join tool filters and the caller's search, and name the bad part", () => {
    const both = allOf(["duration:>=5ms", null, "service:api OR service:web"]);
    expect(both).toEqual({ ok: true, node: { type: "and", items: [parseSearch("duration:>=5ms"), parseSearch("service:api OR service:web")] } });
    expect(allOf([undefined, ""])).toEqual({ ok: true, node: null });
    expect(allOf(["status:abc"])).toMatchObject({ ok: false, error: expect.stringContaining('"status:abc"') });
  });
});
