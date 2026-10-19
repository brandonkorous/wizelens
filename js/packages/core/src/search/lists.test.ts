import { describe, expect, it } from "vitest";
import { runPageSync } from "../models/index.js";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { isStructuredSearch, memorySearchIds } from "./lists.js";
import { searchMemory } from "./run.js";
import { searchSummary } from "./summary.js";

const traces = scenarioTraces();
const ex = memoryExecutor(traces);
const window = { from: SCENARIO_NOW - 7 * 86_400_000, to: SCENARIO_NOW };

describe("search on list pages", () => {
  it("tells free words from structured searches", () => {
    expect([isStructuredSearch("orders"), isStructuredSearch("pay timeout"), isStructuredSearch("status:5xx"), isStructuredSearch("NOT orders"), isStructuredSearch("@user.id:42"), isStructuredSearch("status:")]).toEqual([false, false, true, true, true, false]);
  });

  it("keeps only the requests a structured search matches", () => {
    const ids = memorySearchIds(traces, "requests", "status:5xx", window);
    expect(ids.length).toBeGreaterThan(0);
    const ctx = { ...pageContext("7d", SCENARIO_NOW, { q: "status:5xx", size: "500" }), searchIds: ids };
    const m = runPageSync("requests", ctx, ex);
    expect(m.total).toBe(ids.length);
    expect(m.rows.every((r) => (r.status ?? 0) >= 500)).toBe(true);
    const logs = runPageSync("logs", { ...pageContext("7d", SCENARIO_NOW, { q: "level:error" }), searchIds: memorySearchIds(traces, "logs", "level:error", window) }, ex);
    expect(logs.rows.length).toBeGreaterThan(0);
  });

  it("counts every kind and spreads the chosen one over time", async () => {
    const node = { type: "field", field: "service", cmp: "eq", value: { type: "text", value: "api" } } as const;
    const s = await searchSummary((q) => searchMemory(traces, q), "requests", node as never, window);
    expect(s.counts.requests.n).toBeGreaterThan(0);
    expect(s.histogram.reduce((t, n) => t + n, 0)).toBe(s.counts.requests.n);
    expect(s.starts).toHaveLength(24);
  });
});
