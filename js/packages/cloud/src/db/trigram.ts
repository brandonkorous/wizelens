import type { Db, Queryable } from "./db.js";

// Best effort (docs/SEARCH-PLAN.md, small mode): with pg_trgm, "contains" searches read GIN trigram indexes; without it they scan the time window.
const COLUMNS = [["fact_search", "text"], ["fact_requests", "search"], ["fact_traces", "search"], ["fact_logs", "search"]] as const;

/** One index, built without blocking writes; a half-built one from a stopped run is dropped first. */
async function buildIndex(q: Queryable, table: string, col: string): Promise<void> {
  const name = `ix_${table}_trgm`;
  const [old] = await q.query<{ valid: boolean }>("SELECT i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1", [name]);
  if (old?.valid) return;
  if (old) await q.query(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
  await q.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${table} USING gin (${col} gin_trgm_ops)`);
}

/** Add pg_trgm and the indexes, with no time limit (a big table takes minutes). False when the database has no pg_trgm. */
export async function ensureTrigram(db: Db): Promise<boolean> {
  return db.session(async (q) => {
    try {
      await q.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    } catch (err) {
      console.warn(`pg_trgm is not available, so text searches scan the time window: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    await q.query("SET statement_timeout = 0");
    try {
      for (const [table, col] of COLUMNS) await buildIndex(q, table, col);
    } finally {
      await q.query("RESET statement_timeout");
    }
    return true;
  });
}
