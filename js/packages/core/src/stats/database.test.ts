import { describe, expect, it } from "vitest";
import { makeRequest } from "../testing/fixtures.js";
import { dbCalls, dbSummary, operationRows, queryRows, tableRows } from "./database.js";

const traces = [
  makeRequest({ route: "/api/orders", queries: [{ sql: "SELECT * FROM orders WHERE id = 1", ms: 150 }, { sql: "UPDATE orders SET paid = 1", ms: 10 }] }),
  makeRequest({ route: "/api/orders", queries: [{ sql: "SELECT * FROM orders WHERE id = 2", ms: 50 }] }),
  makeRequest({ route: "/api/users", queries: [{ sql: 'SELECT name FROM "users"', ms: 4 }] }),
];

describe("database stats", () => {
  const calls = dbCalls(traces);

  it("collects calls with their endpoint, operation, and table", () => {
    expect(calls).toHaveLength(4);
    expect(calls[0]).toMatchObject({ endpoint: "GET /api/orders", operation: "SELECT", table: "orders", query: "SELECT * FROM orders WHERE id = ?" });
    expect(calls.find((c) => c.operation === "UPDATE")?.table).toBe("orders");
    expect(calls.at(-1)?.table).toBe("users");
  });

  it("summarizes and groups queries by shape", () => {
    expect(dbSummary(calls, 100)).toEqual({ queries: 4, avgMs: 53.5, slow: 1, totalMs: 214 });
    const top = queryRows(calls, 100)[0]!;
    expect(top).toMatchObject({ query: "SELECT * FROM orders WHERE id = ?", count: 2, avgMs: 100, maxMs: 150, slow: 1, endpoints: ["GET /api/orders"] });
  });

  it("groups tables and operations", () => {
    expect(tableRows(calls)[0]).toMatchObject({ table: "orders", queries: 3, rows: null });
    const ops = operationRows(calls);
    expect(ops.map((o) => o.operation)).toEqual(["SELECT", "INSERT", "UPDATE", "DELETE", "OTHER"]);
    expect(ops[0]).toMatchObject({ count: 3, totalMs: 204 });
    expect(ops[1]).toMatchObject({ count: 0, avgMs: null });
  });
});
