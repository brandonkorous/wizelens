import "reflect-metadata";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DataSource } from "typeorm";
import { afterEach, describe, expect, it } from "vitest";
import type { Span } from "@wizeworks/lens-core";
import { createWizeLens } from "../wizelens.js";
import { instrumentBetterSqlite3 } from "./sqlite.js";
import { instrumentDrizzle } from "./drizzle.js";
import { prismaExtension } from "./prisma.js";
import { instrumentTypeOrm } from "./typeorm.js";

const wizelens = createWizeLens({ serviceName: "orm", storage: "memory", traceQueriesOutsideRequests: true });
const dbSpans = (): Span[] => wizelens.store.all().flatMap((t) => t.spans.filter((s) => s.category === "db")).sort((a, b) => a.startMs - b.startMs);
afterEach(() => wizelens.store.clear());

describe("prisma", () => {
  const ext = prismaExtension(wizelens, { system: "postgresql" });
  const run = (model: string | undefined, operation: string, args: unknown, result: unknown, inside?: () => void) =>
    ext.query.$allOperations({ model, operation, args, query: async () => (inside?.(), result) });

  it("traces model operations with a stable query text, so N+1 can be found", async () => {
    await run("User", "findUnique", { where: { id: 1 } }, { id: 1 });
    await run("User", "createMany", { data: [] }, { count: 3 });
    const [find, create] = dbSpans();
    expect(find!.attributes).toMatchObject({ "db.query.text": "prisma.User.findUnique", "db.operation.name": "SELECT", "db.collection.name": "User", "wizelens.db.adapter": "prisma", "db.system.name": "postgresql" });
    expect(create!.attributes["db.response.returned_rows"]).toBe(3);
  });

  it("reads raw SQL and hides driver spans below it", async () => {
    const db = new Database(":memory:");
    instrumentBetterSqlite3(wizelens, db);
    await run(undefined, "$queryRawUnsafe", ["SELECT 1 AS x"], [{ x: 1 }], () => db.prepare("SELECT 1 AS x").get());
    const spans = dbSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes).toMatchObject({ "db.query.text": "SELECT 1 AS x", "wizelens.db.adapter": "prisma" });
  });
});

describe("typeorm", () => {
  it("traces every query of a real DataSource", async () => {
    const ds = new DataSource({ type: "sqljs", entities: [], synchronize: false });
    await ds.initialize();
    expect(instrumentTypeOrm(wizelens, ds)).toBe(true);
    await ds.query("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)");
    await ds.query("INSERT INTO notes (body) VALUES (?)", ["hello"]);
    const rows = await ds.query("SELECT * FROM notes");
    expect(rows).toHaveLength(1);
    const spans = dbSpans();
    expect(spans.map((s) => s.attributes["db.operation.name"])).toEqual(["CREATE", "INSERT", "SELECT"]);
    expect(spans[2]!.attributes).toMatchObject({ "db.system.name": "sqlite", "wizelens.db.adapter": "typeorm", "db.response.returned_rows": 1 });
    await ds.destroy();
  });
});

describe("drizzle", () => {
  it("traces a real Drizzle database through its driver", () => {
    const client = new Database(":memory:");
    const db = drizzle(client);
    expect(instrumentDrizzle(wizelens, db)).toBe("better-sqlite3");
    db.run(sql`CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT)`);
    db.run(sql`INSERT INTO tags (name) VALUES (${"red"})`);
    const rows = db.all(sql`SELECT * FROM tags`);
    expect(rows).toHaveLength(1);
    const spans = dbSpans();
    expect(spans.map((s) => s.attributes["wizelens.db.adapter"])).toEqual(["drizzle", "drizzle", "drizzle"]);
    expect(spans[1]!.attributes["wizelens.db.parameters"]).toBe('["red"]');
  });

  it("returns null for drivers it does not know", () => {
    expect(instrumentDrizzle(wizelens, { $client: { something: true } })).toBeNull();
  });
});
