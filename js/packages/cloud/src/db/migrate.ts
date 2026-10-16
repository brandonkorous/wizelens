import type { Db } from "./db.js";
import { MIGRATIONS, MIGRATIONS_TABLE } from "./schema.js";

/** Apply every migration not applied yet, each in its own transaction. Returns how many ran. */
export async function migrate(db: Db): Promise<number> {
  await db.exec(MIGRATIONS_TABLE);
  const done = new Set((await db.query<{ version: number }>("SELECT version FROM wizelens_migrations")).map((r) => r.version));
  let ran = 0;
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (done.has(version)) continue;
    await db.tx(async (q) => {
      for (const statement of splitStatements(MIGRATIONS[i]!)) await q.query(statement);
      await q.query("INSERT INTO wizelens_migrations (version, applied_ms) VALUES ($1, $2)", [version, Date.now()]);
    });
    ran++;
  }
  return ran;
}

/** One migration as single statements, so it runs inside a transaction on every driver. */
export const splitStatements = (sql: string): string[] =>
  sql
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ""))
    .filter(Boolean);
