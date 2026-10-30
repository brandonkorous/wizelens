import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql as dsql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { Span } from "@wizeworks/lens-core/internal";
import { createWizeLens } from "../wizelens.js";
import { driverOf, instrumentDrizzle } from "./drizzle.js";
import { instrumentPostgresJs, labelPostgresJs } from "./postgres.js";

const wizelens = createWizeLens({ service: "postgres-js", storage: "memory", traceQueriesOutsideRequests: true });
const dbSpans = (): Span[] => wizelens.store.all().flatMap((t) => t.spans.filter((s) => s.category === "db")).sort((a, b) => a.startMs - b.startMs);
afterEach(() => wizelens.store.clear());

// Nothing listens on port 1: a query that reaches the driver fails fast, and building one connects nowhere.
const sql = postgres({ host: "127.0.0.1", port: 1, max: 1, connect_timeout: 2 });
afterAll(() => sql.end({ timeout: 0 }));

interface FakeQuery {
  strings: readonly string[];
  string?: string;
  resolve(value: unknown): void;
  reject(err: unknown): void;
}
type QueryClass = new (strings: readonly string[], args: unknown[], handler: (q: FakeQuery) => void, canceller: null) => PromiseLike<unknown>;
const Query = Object.getPrototypeOf(sql.unsafe("SELECT 1")).constructor as QueryClass;

/** A tagged-template `sql` whose "connection" answers after 1 ms, the way postgres.js settles a query. */
function fakeSql(answer: (q: FakeQuery) => void) {
  const handler = (q: FakeQuery) => void setTimeout(() => answer(q), 1);
  return (strings: TemplateStringsArray, ...args: unknown[]) => new Query(strings, args, handler, null);
}
const rows = (n: number) => Object.assign(Array.from({ length: n }, () => ({})), { count: n });

describe("postgres.js", () => {
  it("patches the query class through a real sql instance", () => {
    expect(instrumentPostgresJs(wizelens, sql)).toBe(true);
    expect(instrumentPostgresJs(wizelens, Query)).toBe(true);
    expect(instrumentPostgresJs(wizelens, {})).toBe(false);
  });

  it("traces a tagged query when it runs, with rows and parameters", async () => {
    const run = fakeSql((q) => q.resolve(rows(2)));
    const pending = run`SELECT * FROM orders WHERE id = ${7}`;
    expect(dbSpans()).toEqual([]);
    await pending;
    const [span] = dbSpans();
    expect(span!.name).toBe("SELECT orders");
    expect(span!.attributes).toMatchObject({
      "db.system.name": "postgresql",
      "db.query.text": "SELECT * FROM orders WHERE id = $1",
      "wizelens.db.adapter": "postgres",
      "db.response.returned_rows": 2,
      "wizelens.db.parameters": "[7]",
    });
  });

  it("takes the final SQL the connection built", async () => {
    const run = fakeSql((q) => ((q.string = 'SELECT * FROM "users"'), q.resolve(rows(1))));
    await run`SELECT * FROM ${{ fragment: true }}`;
    expect(dbSpans()[0]!.attributes["db.query.text"]).toBe('SELECT * FROM "users"');
    expect(dbSpans()[0]!.name).toBe("SELECT users");
  });

  it("marks a failed query", async () => {
    const run = fakeSql((q) => q.reject(new Error("relation does not exist")));
    await expect(run`DELETE FROM missing`).rejects.toThrow("relation does not exist");
    expect(dbSpans()[0]).toMatchObject({ name: "DELETE missing", status: "error" });
  });

  it("traces a real query that cannot connect", async () => {
    await expect(sql`SELECT 1`).rejects.toThrow();
    expect(dbSpans()[0]).toMatchObject({ status: "error", attributes: { "wizelens.db.adapter": "postgres" } });
  });
});

describe("drizzle on postgres.js", () => {
  it("finds the driver and labels its queries", async () => {
    expect(driverOf(sql)).toBe("postgres-js");
    expect(instrumentDrizzle(wizelens, drizzle(sql))).toBe("postgres-js");
    await expect(drizzle(sql).execute(dsql`SELECT * FROM orders`)).rejects.toThrow();
    expect(dbSpans()[0]!.attributes).toMatchObject({ "wizelens.db.adapter": "drizzle", "db.query.text": "SELECT * FROM orders" });
  });

  it("labels the sql a transaction hands its callback", () => {
    const tx = { unsafe: (text: string) => ({ text }) };
    const client = { unsafe: tx.unsafe, begin: (fn: (t: unknown) => unknown) => fn(tx) };
    labelPostgresJs(client, "drizzle");
    const q = client.begin((t) => (t as typeof tx).unsafe("SELECT 1")) as Record<symbol, unknown>;
    expect(q[Symbol.for("wizeworks.wizelens.postgres-label")]).toBe("drizzle");
  });
});
