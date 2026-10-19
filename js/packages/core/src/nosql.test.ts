import { describe, expect, it } from "vitest";
import { analyzeTrace } from "./analysis.js";
import { ATTR_DB_FINGERPRINT } from "./attributes.js";
import { noSqlOperation } from "./nosql.js";
import { normalizeQuery } from "./stats/common.js";
import { dbCalls, operationOf } from "./stats/database.js";
import { makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";
import type { Span } from "./types.js";

const call = (system: string, text: string, op: string, fp: string, startMs: number) =>
  makeSpan({ category: "db", startMs, durationMs: 1, attributes: { "db.system.name": system, "db.query.text": text, "db.operation.name": op, [ATTR_DB_FINGERPRINT]: fp } });
const server = makeSpan({ category: "http.server", kind: "server", startMs: 0, durationMs: 500, name: "GET /cart", attributes: { "http.route": "/cart" } });
const trace = (spans: Span[]) => buildTrace("b".repeat(32), [server, ...spans], [], []);
const kinds = (spans: Span[]) => analyzeTrace(trace(spans)).map((f) => f.kind);

describe("NoSQL calls in request analysis", () => {
  it("finds N+1 on a repeated shape, and duplicates only when the values fingerprint repeats", () => {
    const reads = Array.from({ length: 5 }, (_, i) => call("redis", "GET user:?", "GET", `f${i}`, 10 + i));
    expect(kinds(reads)).toEqual(["n+1-db"]);
    const same = [call("mongodb", 'findOne users {"_id":?}', "findOne", "x", 10), call("mongodb", 'findOne users {"_id":?}', "findOne", "x", 20)];
    expect(kinds(same)).toEqual(["duplicate-query"]);
  });

  it("never treats a Redis SET as a SQL session statement", () => {
    const sets = Array.from({ length: 5 }, (_, i) => call("redis", "SET cart:?", "SET", `s${i}`, 10 + i));
    expect(kinds(sets)).toEqual(["n+1-db"]);
  });

  it("keeps SQL with placeholders and no parameters out of the duplicate check", () => {
    const sql = (t: number) => makeSpan({ category: "db", startMs: t, durationMs: 1, attributes: { "db.query.text": "SELECT * FROM a WHERE id = ?" } });
    expect(kinds([sql(10), sql(20)])).toEqual([]);
  });
});

describe("NoSQL operations", () => {
  it("map commands, methods, and APIs to the closest SQL operation", () => {
    expect(["GET", "findOne", "search", "SET", "insertMany", "index", "updateOne", "INCR", "DEL", "delete_by_query", "bulkWrite", "PING"].map(noSqlOperation)).toEqual(
      ["SELECT", "SELECT", "SELECT", "INSERT", "INSERT", "INSERT", "UPDATE", "UPDATE", "DELETE", "DELETE", "OTHER", "OTHER"],
    );
  });

  it("apply only to NoSQL systems, so SQL keeps its first word", () => {
    expect(operationOf(call("redis", "GET user:?", "GET", "a", 1))).toBe("SELECT");
    expect(operationOf(makeSpan({ category: "db", attributes: { "db.system.name": "postgresql", "db.query.text": "SET search_path = x" } }))).toBe("OTHER");
  });

  it("group on the Database page by shape, collection, and system", () => {
    const calls = dbCalls([trace([call("mongodb", 'find orders {"status":?}', "find", "a", 5)])]);
    expect(calls[0]).toMatchObject({ query: 'find orders {"status":?}', operation: "SELECT", system: "mongodb" });
  });
});

describe("normalizeQuery", () => {
  it("turns ids in NoSQL commands into ?", () => {
    expect(normalizeQuery("GET user:123")).toBe("GET user:?");
    expect(normalizeQuery("GET session:3f2a9c1e-4b7d-4c1a-9e2f-0a1b2c3d4e5f")).toBe("GET session:?");
    expect(normalizeQuery("GET /orders/_doc/507f1f77bcf86cd799439011")).toBe("GET /orders/_doc/?");
  });

  it("leaves SQL as before", () => {
    expect(normalizeQuery("SELECT * FROM t WHERE id = 42 AND name = 'O''Neil'")).toBe("SELECT * FROM t WHERE id = ? AND name = ?");
    expect(normalizeQuery("SELECT deadbeef, cafe_babe_feed_face FROM t2 WHERE x = 0x1f")).toBe("SELECT deadbeef, cafe_babe_feed_face FROM t2 WHERE x = 0x1f");
    expect(normalizeQuery("SELECT * FROM t WHERE id = '3f2a9c1e-4b7d-4c1a-9e2f-0a1b2c3d4e5f'")).toBe("SELECT * FROM t WHERE id = ?");
  });
});
