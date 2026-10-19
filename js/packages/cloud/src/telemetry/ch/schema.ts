// ClickHouse schema setup: the database, then every table and view. Statements are idempotent, so each start runs them all.
import { type ChClient, chClient } from "./http.js";
import { FACT_ALTERS, FACT_DDL } from "./schema-facts.js";
import { RAW_TABLES } from "./schema-raw.js";
import { ROLLUP_DDL } from "./schema-rollups.js";

const TABLES = [...RAW_TABLES, ...FACT_DDL, ...ROLLUP_DDL].map((s) => /^CREATE TABLE IF NOT EXISTS (\w+)/.exec(s)?.[1]).filter((t): t is string => !!t);

/** New parts write no column statistics (see http.ts); old parts lose theirs as they merge. */
const NO_STATISTICS = TABLES.map((t) => `ALTER TABLE ${t} MODIFY SETTING auto_statistics_types = ''`);

/** Every statement, in order. A change to a shipped table needs an ALTER added here, never an edit to its CREATE. */
export const CH_SCHEMA: readonly string[] = [...RAW_TABLES, ...FACT_DDL, ...FACT_ALTERS, ...ROLLUP_DDL, ...NO_STATISTICS];

/** Tables whose rows belong to one project, for clearing it. Views are left out. */
export const PROJECT_TABLES: readonly string[] = TABLES.filter((t) => t !== "trace_updates");

/** Every statement without its TTL clauses: for tests on a fixed clock, whose rows would expire on insert. */
export const withoutTtl = (sql: string): string => sql.replace(/\sTTL\s[\s\S]*?DELETE/g, "");

/** Create the database (through the default one) and every table and view. `ttl: false` keeps every row (tests only). */
export async function migrateClickHouse(url: string, client: ChClient, o: { ttl?: boolean } = {}): Promise<void> {
  const u = new URL(url);
  u.pathname = "/default";
  await chClient({ url: u.toString() }).command(`CREATE DATABASE IF NOT EXISTS \`${client.database.replace(/`/g, "")}\``);
  for (const sql of CH_SCHEMA) await client.command(o.ttl === false ? withoutTtl(sql) : sql);
}
