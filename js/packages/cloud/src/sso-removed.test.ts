import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { openPglite } from "./db/db.js";
import { migrate, splitStatements } from "./db/migrate.js";
import { MIGRATIONS, MIGRATIONS_TABLE } from "./db/schema.js";
import { seedOrg } from "./test/db.js";

/** The migration that keeps removed people out of single sign-on's joining. */
const REMOVED = MIGRATIONS.length;

it("keeps out people the audit log shows removed, unless they are back in", async () => {
  const db = await openPglite();
  await db.exec(MIGRATIONS_TABLE);
  for (let v = 1; v < REMOVED; v++) {
    for (const s of splitStatements(MIGRATIONS[v - 1]!)) await db.query(s);
    await db.query("INSERT INTO wizelens_migrations (version, applied_ms) VALUES ($1, 1)", [v]);
  }
  const { userId, orgId } = await seedOrg(db);
  const person = async (email: string) => {
    const id = randomUUID();
    await db.query("INSERT INTO users (id, name, email, email_verified) VALUES ($1, $2, $3, TRUE)", [id, email, email]);
    return id;
  };
  const gone = await person("ngozi@kvcu.test");
  const back = await person("aidan@kvcu.test");
  await db.query("INSERT INTO members (id, org_id, user_id, role, created_at) VALUES ($1, $2, $3, 'member', now())", [randomUUID(), orgId, back]);
  const removed = (detail: unknown, at: number) =>
    db.query("INSERT INTO audit (id, org_id, actor, action, detail, time_ms) VALUES ($1, $2, $3, 'member.remove', $4, $5)", [randomUUID(), orgId, `user:${userId}`, JSON.stringify(detail), at]);
  await removed({ memberIdOrEmail: "m1", memberEmail: "Ngozi@kvcu.test" }, 1000);
  await removed({ memberIdOrEmail: "ngozi@kvcu.test" }, 2000);
  await removed({ memberIdOrEmail: "m2", memberEmail: "aidan@kvcu.test" }, 3000);
  expect(await migrate(db)).toBe(1);
  expect(await db.query("SELECT user_id, removed_ms FROM sso_removed")).toEqual([{ user_id: gone, removed_ms: 2000 }]);
  await db.close();
});
