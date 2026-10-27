import { describe, expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { dbCalls } from "../stats/database.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { type PageName, runPageSync } from "./index.js";

const ex = memoryExecutor(scenarioTraces());
const run = <P extends PageName>(page: P, params: Record<string, string> = {}) => runPageSync(page, pageContext("7d", SCENARIO_NOW, params), ex);
const sum = (v: readonly (number | null)[]) => v.reduce<number>((t, x) => t + (x ?? 0), 0);

describe("detail pages", () => {
  it("shows one error group: its count over time, endpoints, and newest occurrences", () => {
    const g = run("errors", { size: "200" }).groups[0]!;
    const m = run("error", { group: g.key });
    expect(m.group?.key).toBe(g.key);
    expect(sum(m.chart.count)).toBe(m.group!.count);
    expect(sum(m.endpoints.map((e) => e.count))).toBe(m.group!.count);
    expect(m.requests.length + m.traces.length).toBeGreaterThan(0);
    expect(m.traces.every((t) => m.group!.traceIds.includes(t.traceId))).toBe(true);
    expect(run("error", { group: "nope" }).group).toBeNull();
  });

  it("shows one endpoint: totals with percentiles, its chart, queries, and calls", () => {
    const svc = run("service", { service: "api:orders" });
    const ep = svc.endpoints[0]!;
    const m = run("endpoint", { service: "api:orders", endpoint: ep.name });
    expect(m.totals).toMatchObject({ count: ep.count, errors: ep.errors });
    expect(m.totals!.p95Ms).not.toBeNull();
    expect(m.totals!.p50Ms! <= m.totals!.p99Ms!).toBe(true);
    expect(sum(m.chart.count)).toBe(ep.count);
    expect(m.recent.length).toBeGreaterThan(0);
    expect(run("endpoint", { service: "orders", endpoint: ep.name }).totals?.count).toBe(ep.count);
    expect(run("endpoint", { service: "api:orders", endpoint: "nope" }).totals).toBeNull();
  });

  it("files queries and calls under the endpoint that ran them", () => {
    const withQueries = run("service", { service: "api:orders" }).endpoints.map((e) => run("endpoint", { service: "orders", endpoint: e.name }));
    expect(withQueries.some((m) => m.queries.length > 0)).toBe(true);
    expect(withQueries.every((m) => m.queries.every((q) => q.count > 0))).toBe(true);
  });

  it("shows one query: count, the services and endpoints that run it, and its requests", () => {
    const db = run("database", { size: "200" });
    const q = db.queries[0]!;
    const m = run("query", { q: q.query });
    expect(m.totals?.count).toBe(dbCalls(scenarioTraces()).filter((c) => c.query === q.query && c.startMs >= m.meta.window.from && c.startMs < m.meta.window.to).length);
    expect(sum(m.services.map((s) => s.count))).toBe(m.totals!.count);
    expect(m.slowest?.durationMs).toBe(q.maxMs);
    expect(m.traces.length).toBeGreaterThan(0);
  });

  it("shows one route: views, measures, and components", () => {
    const r = run("rendering").routes[0]!;
    const m = run("route", { route: r.route });
    expect(m.views).toBe(r.views);
    expect(sum(m.chart.views)).toBe(r.views);
    expect(m.averages.render).toBeCloseTo(r.avgRenderMs!, 6);
    expect(m.loads.length).toBeGreaterThan(0);
  });
});

describe("query spread", () => {
  it("gives each query shape a p95, on the list and on its page, within the histogram's 2%", () => {
    const q = run("database", { size: "200" }).queries.find((x) => x.count >= 3)!;
    const runs = dbCalls(scenarioTraces()).filter((c) => c.query === q.query).map((c) => c.durationMs).sort((x, y) => x - y);
    const exact = runs[Math.ceil(0.95 * runs.length) - 1]!;
    expect(q.p95Ms! / exact).toBeCloseTo(1, 1);
    expect(run("query", { q: q.query }).totals?.p95Ms).toBe(q.p95Ms);
  });
});
