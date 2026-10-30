import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { logSearchOf } from "@wizeworks/lens-core/internal";
import { openPglite } from "./db/db.js";
import { migrate, splitStatements } from "./db/migrate.js";
import { MIGRATIONS, MIGRATIONS_TABLE } from "./db/schema.js";
import { listSaved } from "./repo/saved.js";
import { seedOrg } from "./test/db.js";

/** The migration that moves saved log searches into saved items. */
const MOVE = 22;

it("moves saved log searches into saved items as shared, charted Logs searches, then drops their table", async () => {
  const db = await openPglite();
  await db.exec(MIGRATIONS_TABLE);
  for (let v = 1; v < MOVE; v++) {
    for (const s of splitStatements(MIGRATIONS[v - 1]!)) await db.query(s);
    await db.query("INSERT INTO wizelens_migrations (version, applied_ms) VALUES ($1, 1)", [v]);
  }
  const { userId, orgId } = await seedOrg(db);
  const projectId = randomUUID();
  await db.query("INSERT INTO projects (id, org_id, name, slug, created_ms) VALUES ($1, $2, 'Shop', 'shop', 1000)", [projectId, orgId]);
  const add = (id: string, params: unknown, by: string, at: number) =>
    db.query("INSERT INTO saved_searches (id, project_id, kind, name, params, created_by, created_ms) VALUES ($1, $2, 'logs', $3, $4, $5, $6)", [id, projectId, `Search ${id}`, JSON.stringify(params), by, at]);
  await add("a", { level: "error", q: "timeout & retry=2 #5 100%+" }, `user:${userId}`, 1000);
  await add("b", {}, "key:k1", 2000);
  expect(await migrate(db)).toBe(MIGRATIONS.length - MOVE + 1);
  const items = await listSaved(db, projectId, userId);
  expect(items).toMatchObject([
    { id: "a", kind: "search", name: "Search a", owner: userId, ownerName: "Owner", shared: true, chart: true, createdMs: 1000, updatedMs: 1000 },
    { id: "b", kind: "search", href: "#/logs", owner: "key:k1", shared: true, chart: true },
  ]);
  expect(logSearchOf(items[0]!.href)).toEqual({ level: "error", q: "timeout & retry=2 #5 100%+" });
  expect(await db.query("SELECT to_regclass('saved_searches') AS t")).toEqual([{ t: null }]);
  await db.close();
});
