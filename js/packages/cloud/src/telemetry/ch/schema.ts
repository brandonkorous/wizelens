// ClickHouse schema setup: the database, then every table and view. Statements are idempotent, so each start runs them all.
import { type ChClient, chClient } from "./http.js";
import { FACT_ALTERS, FACT_DDL } from "./schema-facts.js";
import { RAW_ALTERS, RAW_TABLES } from "./schema-raw.js";
import { ROLLUP_DDL } from "./schema-rollups.js";

const TABLES = [...RAW_TABLES, ...FACT_DDL, ...ROLLUP_DDL].map((s) => /^CREATE TABLE IF NOT EXISTS (\w+)/.exec(s)?.[1]).filter((t): t is string => !!t);

/** New parts write no column statistics (see http.ts); old parts lose theirs as they merge. */
const NO_STATISTICS = TABLES.map((t) => `ALTER TABLE ${t} MODIFY SETTING auto_statistics_types = ''`);

/** Tables only settling writes, always with a token: a retried insert lands once (see settle-rows.ts, Label). */
const DEDUPLICATED = TABLES.filter((t) => /^(fact_|rollup_|hist_)|^settle_state$/.test(t)).map((t) => `ALTER TABLE ${t} MODIFY SETTING non_replicated_deduplication_window = 1000`);

/** Tables whose rows belong to one project, for clearing it. Views are left out. */
export const PROJECT_TABLES: readonly string[] = TABLES.filter((t) => t !== "trace_updates");

/** Telemetry tables: every row names its organization, so a read held to one organization never sees another's rows. */
export const ORG_TABLES: readonly string[] = PROJECT_TABLES.filter((t) => t !== "project_retention");

/** `org_id` came after the tables shipped. Empty until written or stamped (see admin.ts, stampOrgs). */
const ORG_COLUMNS = ORG_TABLES.map((t) => `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS org_id LowCardinality(String) DEFAULT ''`);

const isView = (sql: string) => sql.trimStart().startsWith("CREATE OR REPLACE VIEW");
const DDL = [...RAW_TABLES, ...RAW_ALTERS, ...FACT_DDL, ...FACT_ALTERS, ...ROLLUP_DDL];

/** Every statement, in order: tables and their changes, then the views, which read columns the changes add. A change to a shipped table needs an ALTER, never an edit to its CREATE. */
export const CH_SCHEMA: readonly string[] = [...DDL.filter((s) => !isView(s)), ...ORG_COLUMNS, ...DDL.filter(isView), ...NO_STATISTICS, ...DEDUPLICATED];

/** Every statement without its TTL clauses: for tests on a fixed clock, whose rows would expire on insert. */
export const withoutTtl = (sql: string): string => sql.replace(/\sTTL\s[\s\S]*?DELETE/g, "");

/** Create the database (through the default one) and every table and view. `ttl: false` keeps every row (tests only). */
export async function migrateClickHouse(url: string, client: ChClient, o: { ttl?: boolean } = {}): Promise<void> {
  const u = new URL(url);
  u.pathname = "/default";
  await chClient({ url: u.toString() }).command(`CREATE DATABASE IF NOT EXISTS \`${client.database.replace(/`/g, "")}\``);
  for (const sql of CH_SCHEMA) await client.command(o.ttl === false ? withoutTtl(sql) : sql);
}
