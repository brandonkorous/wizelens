import { DatabaseSync } from "node:sqlite";
import Database from "better-sqlite3";
import mysql from "mysql2";
import pg from "pg";
import { context, trace } from "@opentelemetry/api";
import { afterEach, describe, expect, it } from "vitest";
import type { Span } from "@wizeworks/lens-core/internal";
import { createDbSpans } from "../db.js";
import { createWizeLens } from "../wizelens.js";
import { instrumentBetterSqlite3, instrumentNodeSqlite } from "./sqlite.js";
import { instrumentMysql2 } from "./mysql2.js";
import { instrumentPg } from "./pg.js";

const wizelens = createWizeLens({ service: "drivers", storage: "memory", traceQueriesOutsideRequests: true });
const dbSpans = (): Span[] => wizelens.store.all().flatMap((t) => t.spans.filter((s) => s.category === "db")).sort((a, b) => a.startMs - b.startMs);
afterEach(() => wizelens.store.clear());

type Callback = (err: Error | null, result?: unknown) => void;

describe("pg", () => {
  class FakeClient {
    database = "shop";
    query(text: unknown, values?: unknown, cb?: Callback): unknown {
      const done = typeof values === "function" ? (values as Callback) : cb;
      const result = { rowCount: 2, rows: [{}, {}] };
      if (done) return void setTimeout(() => done(null, result), 1);
      return Promise.resolve(result);
    }
  }

  it("patches the real module and its pools", () => {
    expect(instrumentPg(wizelens, pg)).toBe(true);
    expect((new pg.Pool() as unknown as { Client: unknown }).Client).toBe(pg.Client);
    expect(instrumentPg(wizelens, {})).toBe(false);
  });

  it("traces promise and callback queries with rows and database", async () => {
    instrumentPg(wizelens, { Client: FakeClient });
    const client = new FakeClient();
    await client.query("SELECT * FROM orders WHERE id = $1", [7]);
    await new Promise<void>((r) => client.query({ text: "UPDATE orders SET x = 1" }, undefined, () => r()));
    const spans = dbSpans();
    expect(spans.map((s) => s.name)).toEqual(["SELECT orders", "UPDATE orders"]);
    expect(spans[0]!.attributes).toMatchObject({ "db.system.name": "postgresql", "wizelens.db.adapter": "pg", "db.namespace": "shop", "db.response.returned_rows": 2, "wizelens.db.parameters": "[7]" });
  });
});

describe("mysql2", () => {
  it("patches connections and pools of the real module", () => {
    expect(instrumentMysql2(wizelens, mysql)).toBe(true);
  });

  it("traces callback queries and counts a pool call once", async () => {
    class FakeConnection {
      config = { database: "shop" };
      query(sql: unknown, values: unknown, cb: Callback): void {
        setTimeout(() => cb(null, [{ id: 1 }]), 1);
      }
      execute(sql: unknown, values: unknown, cb: Callback): void {
        this.query(sql, values, cb);
      }
    }
    instrumentMysql2(wizelens, { Connection: FakeConnection });
    const conn = new FakeConnection();
    await new Promise<void>((r) => conn.execute("SELECT * FROM users WHERE id = ?", [1], () => r()));
    const spans = dbSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes).toMatchObject({ "db.system.name": "mysql", "wizelens.db.adapter": "mysql2", "db.namespace": "shop", "db.response.returned_rows": 1 });
  });
});

describe("better-sqlite3", () => {
  it("traces real statements and exec", () => {
    const db = new Database(":memory:");
    expect(instrumentBetterSqlite3(wizelens, db)).toBe(true);
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
    db.prepare("INSERT INTO items (name) VALUES (?)").run("pen");
    const rows = db.prepare("SELECT * FROM items").all();
    expect(rows).toHaveLength(1);
    const spans = dbSpans();
    expect(spans.map((s) => s.attributes["db.operation.name"])).toEqual(["CREATE", "INSERT", "SELECT"]);
    expect(spans[1]!.attributes).toMatchObject({ "db.response.returned_rows": 1, "wizelens.db.parameters": '["pen"]', "wizelens.db.adapter": "better-sqlite3" });
    expect(spans[2]!.attributes["db.response.returned_rows"]).toBe(1);
  });
});

describe("node:sqlite", () => {
  it("traces built-in DatabaseSync statements with the file name", () => {
    const db = new DatabaseSync(":memory:");
    expect(instrumentNodeSqlite(wizelens, db)).toBe(true);
    db.exec("CREATE TABLE kv (k TEXT, v TEXT)");
    db.prepare("INSERT INTO kv VALUES (?, ?)").run("a", "1");
    expect(db.prepare("SELECT * FROM kv WHERE k = ?").get("a")).toBeTruthy();
    const spans = dbSpans();
    expect(spans.map((s) => s.attributes["wizelens.db.adapter"])).toEqual(["node-sqlite", "node-sqlite", "node-sqlite"]);
    expect(spans[1]!.attributes).toMatchObject({ "db.response.returned_rows": 1, "db.namespace": ":memory:", "wizelens.db.parameters": '["a","1"]' });
  });
});

describe("outside requests", () => {
  const info = { system: "sqlite", requireParent: true };

  it("skips adapter queries with no request around them, unless asked", () => {
    expect(createDbSpans(wizelens.tracer, [], false)(info, "SELECT 1", undefined)).toBeNull();
    const span = createDbSpans(wizelens.tracer, [], true)(info, "SELECT 1", undefined);
    expect(span).not.toBeNull();
    span!.end(undefined);
  });

  it("keeps queries inside a request", () => {
    const parent = wizelens.tracer.startSpan("GET /x");
    const span = context.with(trace.setSpan(context.active(), parent), () => createDbSpans(wizelens.tracer, [], false)(info, "SELECT 1", undefined));
    expect(span).not.toBeNull();
    span!.end(undefined);
    parent.end();
  });
});
