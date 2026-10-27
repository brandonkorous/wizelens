import { describe, expect, it } from "vitest";
import { analyzeTrace } from "./analysis.js";
import { insightGroups } from "./stats/insights.js";
import { makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";
import type { Span } from "./types.js";

const query = (text: string, startMs: number, durationMs = 1, params = "") =>
  makeSpan({ category: "db", startMs, durationMs, attributes: { "db.query.text": text, ...(params ? { "wizelens.db.parameters": params } : {}) } });
const server = (spans: Span[]) => [makeSpan({ category: "http.server", kind: "server", startMs: 0, durationMs: 2000, name: "GET /orders", attributes: { "http.route": "/orders" } }), ...spans];
const trace = (spans: Span[]) => buildTrace("a".repeat(32), server(spans), [], []);
const kinds = (spans: Span[]) => analyzeTrace(trace(spans)).map((f) => f.kind);

describe("session statements", () => {
  it("are never N+1 or duplicates", () => {
    const sets = Array.from({ length: 6 }, (_, i) => query("SET LOCAL app.tenant_id = 'a'", i * 10));
    const tx = Array.from({ length: 6 }, (_, i) => query(i % 2 ? "COMMIT" : "BEGIN", 100 + i * 10));
    expect(kinds([...sets, ...tx])).toEqual([]);
  });

  it("do not hide real repeats", () => {
    const reads = Array.from({ length: 5 }, (_, i) => query("SELECT * FROM items WHERE id = ?", i * 10, 1, "[1]"));
    expect(kinds(reads)).toEqual(["n+1-db", "duplicate-query"]);
  });
});

describe("redacted parameters", () => {
  it("never make two runs look the same", () => {
    const lookups = [1, 2].map((i) => query("SELECT * FROM users WHERE email = $1", i * 10, 1, '["[redacted]"]'));
    expect(kinds(lookups)).toEqual([]);
  });
});

describe("slow queries that run together", () => {
  it("become one database wait", () => {
    const slow = ["a", "b", "c", "d"].map((t) => query(`SELECT * FROM ${t}`, 10, 1300));
    const findings = analyzeTrace(trace(slow));
    expect(findings.map((f) => f.kind)).toEqual(["db-wait"]);
    expect(findings[0]!.count).toBe(4);
  });

  it("stay separate slow queries when they do not overlap", () => {
    const slow = [query("SELECT * FROM a", 10, 200), query("SELECT * FROM b", 300, 200), query("SELECT * FROM c", 600, 200)];
    expect(kinds(slow)).toEqual(["slow-query", "slow-query", "slow-query"]);
  });

  it("count their waiting once, as wall time", () => {
    const slow = ["a", "b", "c"].map((t) => query(`SELECT * FROM ${t}`, 10, 1300));
    expect(analyzeTrace(trace(slow))[0]!.totalMs).toBe(1300);
  });

  it("include a slow SET, which does almost no work of its own", () => {
    expect(kinds([query("SET LOCAL app.tenant_id = 'a'", 10, 113)])).toEqual(["db-wait"]);
  });

  it("show as one insight", () => {
    const slow = ["a", "b", "c"].map((t) => query(`SELECT * FROM ${t}`, 10, 1300));
    const groups = insightGroups([trace(slow)]);
    expect(groups.map((g) => g.title)).toEqual(["Database wait"]);
    expect(groups[0]!.impact).toBe("high");
  });
});

describe("queries from agents that leave the parameters out", () => {
  it("are N+1 but never duplicates when the text has placeholders", () => {
    for (const text of ["SELECT * FROM items WHERE id = ?", "SELECT * FROM t WHERE id = $1", "SELECT * FROM t WHERE id = %(id)s", "SELECT * FROM t WHERE id = :id", "SELECT * FROM t WHERE id = @id"]) {
      const reads = Array.from({ length: 5 }, (_, i) => query(text, i * 10));
      expect(kinds(reads)).toEqual(["n+1-db"]);
    }
  });

  it("are duplicates when the values are in the text", () => {
    const reads = Array.from({ length: 2 }, (_, i) => query("SELECT * FROM items WHERE id = 7 AND note = '10:30'", i * 10));
    expect(kinds(reads)).toEqual(["duplicate-query"]);
  });

  it("do not read a Postgres cast as a placeholder", () => {
    expect(kinds([query("SELECT '1'::int", 0), query("SELECT '1'::int", 10)])).toEqual(["duplicate-query"]);
  });
});
