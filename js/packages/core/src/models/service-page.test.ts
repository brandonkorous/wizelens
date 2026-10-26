import { describe, expect, it } from "vitest";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { runPageSync } from "./index.js";

const ex = memoryExecutor(scenarioTraces());
const run = (service?: string) => runPageSync("service", pageContext("24h", SCENARIO_NOW, service ? { service } : {}), ex);
const sum = (values: readonly (number | null)[]) => values.reduce<number>((t, v) => t + (v ?? 0), 0);

describe("service page", () => {
  it("fills an API service: chart, endpoints, errors, slowest requests, and logs", () => {
    const m = run("api:api");
    expect(m.row).toMatchObject({ key: "api:api", kind: "api" });
    expect(m.owned).toBe(true);
    expect(sum(m.chart.requests)).toBe(m.row!.requests);
    expect(sum(m.chart.errors)).toBe(m.row!.errors);
    expect(m.chart.p95Ms.some((v) => v !== null)).toBe(true);
    expect(sum(m.endpoints.map((e) => e.count))).toBe(m.row!.requests);
    expect(m.endpointCount).toBe(m.endpoints.length);
    expect(m.errors.groups.length).toBeGreaterThan(0);
    expect(m.errors.groups.every((g) => g.service === "api")).toBe(true);
    expect(m.errors.exceptions).toBe(sum(m.errors.groups.map((g) => g.count)));
    expect(m.slowest.length).toBeGreaterThan(0);
    expect(m.slowest.every((r) => r.service === "api" || r.services.includes("api"))).toBe(true);
    expect(m.slowest.map((r) => r.durationMs)).toEqual([...m.slowest.map((r) => r.durationMs)].sort((a, b) => b - a));
    expect(m.requestCount).toBeGreaterThanOrEqual(m.slowest.length);
    expect(m.logs.rows.every((l) => l.service === "api")).toBe(true);
    expect(m.logs.total).toBeGreaterThanOrEqual(m.logs.rows.length);
  });

  it("finds a service by name too, and lists who calls it", () => {
    const m = run("orders");
    expect(m.row?.name).toBe("orders");
    expect(m.incoming.every((e) => e.to === "orders")).toBe(true);
    expect(m.incoming.length + m.outgoing.length).toBeGreaterThan(0);
  });

  it("shows a database's queries, without the parts only your own services have", () => {
    const db = runPageSync("services", pageContext("24h", SCENARIO_NOW, {}), ex).rows.find((r) => r.kind === "database")!;
    const m = run(db.key);
    expect(m.owned).toBe(false);
    expect(m.endpoints.length).toBeGreaterThan(0);
    expect(m.errors).toEqual({ groups: [], total: 0, paging: { key: "err", total: 0, page: 1, size: 10, sort: { key: "count", desc: true } }, exceptions: 0, prevExceptions: 0 });
    expect(m.slowest).toEqual([]);
    expect(m.logs.rows).toEqual([]);
  });

  it("is empty for a service that did nothing in the range, and survives JSON", () => {
    for (const m of [run("nope"), run()]) {
      expect(m.row).toBeNull();
      expect(m.endpoints).toEqual([]);
      expect(sum(m.chart.requests)).toBe(0);
      expect(JSON.parse(JSON.stringify(m))).toEqual(m);
    }
  });
});
