import { describe, expect, it } from "vitest";
import { makeRequest } from "../testing/fixtures.js";
import { insightGroups, insightHeadline } from "./insights.js";
import { requestHeadlines } from "./overview.js";
import { requestRows } from "./requests.js";
import { serviceEdges, serviceRows, statusOf } from "./services.js";

const nPlusOne = (startMs: number) =>
  makeRequest({ startMs, route: "/api/customers", queries: Array.from({ length: 6 }, (_, i) => ({ sql: "SELECT * FROM orders WHERE customer_id = @id", params: `[${i}]`, ms: 2 })) });

describe("insight groups", () => {
  it("groups the same problem across requests", () => {
    const groups = insightGroups([nPlusOne(1000), nPlusOne(2000)]);
    const n1 = groups.find((g) => g.kind === "n+1-db")!;
    expect(n1).toMatchObject({ title: "N+1 query pattern", area: "database", occurrences: 2, count: 12, endpoints: ["GET /api/customers"], lastSeenMs: 2002 });
    expect(n1.shape).toBe("SELECT * FROM orders WHERE customer_id = @id");
  });

  it("says the count is an average only when it is one", () => {
    const n1 = (ts: number[]) => insightGroups(ts.map(nPlusOne)).find((g) => g.kind === "n+1-db")!.description;
    expect(n1([1000])).toContain("runs 6 times per request in GET /api/customers.");
    expect(n1([1000, 2000])).toContain("runs 6 times per request on average in GET /api/customers.");
  });

  it("counts the same in every headline: distinct insights, not requests", () => {
    const traces = [nPlusOne(1000), nPlusOne(2000), nPlusOne(3000)];
    const groups = insightGroups(traces);
    const w = { from: 0, to: 10_000 };
    expect(insightHeadline(groups, null, w).value).toBe(groups.length);
    expect(requestHeadlines(requestRows(traces), [], w).withInsights.value).toBe(3);
  });

  it("rates slow queries by their average time", () => {
    const t = makeRequest({ queries: [{ sql: "SELECT * FROM big", ms: 1200 }] });
    expect(insightGroups([t]).find((g) => g.kind === "slow-query")?.impact).toBe("high");
  });
});

describe("services", () => {
  it("lists services and databases with status", () => {
    const ok = makeRequest({ service: "api", queries: [{ sql: "SELECT 1", ms: 1 }] });
    const bad = makeRequest({ service: "api", status: 500 });
    const rows = serviceRows([ok, bad]);
    expect(rows.find((r) => r.key === "api:api")).toMatchObject({ kind: "api", requests: 2, errors: 1, errorRate: 50, status: "unhealthy" });
    expect(rows.find((r) => r.kind === "database")).toMatchObject({ name: "sqlite", requests: 1, status: "healthy" });
    expect(serviceEdges([ok])).toEqual([expect.objectContaining({ from: "api", to: "sqlite", calls: 1 })]);
  });

  it("derives status from errors and latency", () => {
    expect(statusOf(0, 0, null)).toBe("idle");
    expect(statusOf(10, 2, 50)).toBe("degraded");
    expect(statusOf(10, 0, 2000)).toBe("degraded");
    expect(statusOf(10, 0, 50)).toBe("healthy");
  });
});
