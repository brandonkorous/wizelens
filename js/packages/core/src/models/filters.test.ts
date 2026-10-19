import { describe, expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { dbCalls } from "../stats/database.js";
import { displayService, errorEvents } from "../stats/errors.js";
import { requestRows } from "../stats/requests.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { type PageName, runPageSync } from "./index.js";

const traces = scenarioTraces();
const ex = memoryExecutor(traces);
const ctx = pageContext("7d", SCENARIO_NOW, {});
const inRange = <T extends { startMs: number }>(list: readonly T[]) => list.filter((x) => x.startMs >= ctx.window.from && x.startMs < ctx.window.to);
const run = <P extends PageName>(page: P, params: Record<string, string> = {}) => runPageSync(page, pageContext("7d", SCENARIO_NOW, params), ex);

describe("the service filter", () => {
  it("counts only requests that went through the service on the Overview", () => {
    const want = inRange(requestRows(traces)).filter((r) => r.service === "orders" || r.services.includes("orders"));
    const m = run("overview", { service: "orders" });
    expect(m.headlines.total.value).toBe(want.length);
    expect(m.recent.every((r) => r.services.includes("orders"))).toBe(true);
    expect(m.services.some((s) => s.name === "orders")).toBe(true);
  });

  it("counts only the service's exceptions on the Errors page", () => {
    const want = errorEvents(traces).filter((e) => e.service === "api" && e.timeMs >= ctx.window.from && e.timeMs < ctx.window.to);
    const m = run("errors", { service: "api", size: "200" });
    expect(m.cards.exceptions).toBe(want.length);
    expect(m.groups.every((g) => g.service === "api")).toBe(true);
    expect(m.groupCount).toBe(new Set(want.map((e) => e.key)).size);
  });

  it("counts only the service's queries on the Database page", () => {
    const want = inRange(dbCalls(traces)).filter((c) => displayService(c.span.service) === "orders");
    const m = run("database", { service: "orders", size: "200" });
    expect(m.summary.queries).toBe(want.length);
    expect(m.queryShapes).toBe(new Set(want.map((c) => c.query)).size);
  });

  it("lists only the service's traces and counts its log lines", () => {
    const m = run("traces", { service: "orders" });
    expect(m.recent.every((t) => t.services.includes("orders"))).toBe(true);
    const logs = run("logs", { service: "orders" });
    expect(logs.cards.total).toBe(logs.matching);
  });
});

describe("page filters", () => {
  it("filters, sorts, and pages error groups", () => {
    const all = run("errors", { size: "200" });
    const critical = run("errors", { critical: "1", size: "200" });
    expect(critical.groups.every((g) => g.critical)).toBe(true);
    expect(critical.groupCount).toBe(all.groups.filter((g) => g.critical).length);
    const busy = run("errors", { sort: "count", size: "200" }).groups.map((g) => g.count);
    expect(busy).toEqual([...busy].sort((a, b) => b - a));
    const type = all.groups[0]!.type;
    expect(run("errors", { type, size: "200" }).groups.every((g) => g.type === type)).toBe(true);
    const page2 = run("errors", { page: "2", size: "5" });
    expect(page2.groups.map((g) => g.key)).toEqual(all.groups.slice(5, 10).map((g) => g.key));
    const endpoint = all.groups[0]!.endpoint;
    expect(run("errors", { endpoint, size: "200" }).groups.every((g) => g.endpoints.includes(endpoint))).toBe(true);
  });

  it("filters queries by operation, text, and database, and sorts them", () => {
    const select = run("database", { operation: "select", size: "200" });
    expect(select.queries.length).toBeGreaterThan(0);
    expect(select.queries.every((q) => /^select/i.test(q.query))).toBe(true);
    const total = run("database", { sort: "total", size: "200" }).queries.map((q) => q.totalMs);
    expect(total).toEqual([...total].sort((a, b) => b - a));
    const db = select.databases[0]!;
    expect(run("database", { database: db, size: "200" }).queryShapes).toBeGreaterThan(0);
    expect(run("database", { database: "nope" }).queries).toEqual([]);
  });

  it("filters traces by status and duration, and logs by exact level", () => {
    const failed = run("traces", { status: "error", size: "200" });
    expect(failed.recent.every((t) => t.status === "error")).toBe(true);
    expect(failed.selected?.traceId).toBe(failed.recent[0]?.traceId);
    expect(run("traces", { duration: "slowest", size: "200" }).recent.every((t) => t.durationMs >= 1000)).toBe(true);
    const warn = run("logs", { level: "warn", exact: "1", size: "500" });
    expect(warn.rows.every((r) => r.level === "warn")).toBe(true);
  });

  it("filters requests by endpoint and insights", () => {
    const rows = run("requests", { size: "500" }).rows;
    const endpoint = rows[0]!.endpoint;
    expect(run("requests", { endpoint, size: "500" }).rows.every((r) => r.endpoint === endpoint)).toBe(true);
    expect(run("requests", { insights: "1", size: "500" }).rows.every((r) => r.insights > 0)).toBe(true);
  });
});
