import type { DatabaseSync } from "node:sqlite";
import { FACTS_VERSION } from "@wizeworks/lens-core";
import { SAVED_SEARCH_SCHEMA } from "./saved-searches.js";
import { upgradeFts } from "./schema-fts.js";
import { HUB_SCHEMA, HUB_SCHEMA_VERSION } from "./schema.js";

// Stats tables (docs/CONTRACT.md, "Hub storage"): facts per trace, rollups per tier, and metric rollups. The tiers are identical.
const TIERS = ["10s", "5m", "1h"];

const rollupTable = (t: string) => `
CREATE TABLE IF NOT EXISTS rollup_${t} (
  project TEXT NOT NULL DEFAULT '', env TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, key TEXT NOT NULL, bucket_ms REAL NOT NULL,
  n REAL NOT NULL, err REAL NOT NULL, sum_v REAL NOT NULL, c0 REAL NOT NULL DEFAULT 0, c1 REAL NOT NULL DEFAULT 0, c2 REAL NOT NULL DEFAULT 0,
  c3 REAL NOT NULL DEFAULT 0, c4 REAL NOT NULL DEFAULT 0, c5 REAL NOT NULL DEFAULT 0, first_ms REAL NOT NULL, last_ms REAL NOT NULL,
  top_rank REAL NOT NULL DEFAULT 0, top TEXT, ids TEXT NOT NULL DEFAULT '', PRIMARY KEY (kind, bucket_ms, project, env, key)
);
CREATE INDEX IF NOT EXISTS ix_rollup_${t}_key ON rollup_${t} (kind, key, bucket_ms);
CREATE TABLE IF NOT EXISTS hist_${t} (
  project TEXT NOT NULL DEFAULT '', env TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, key TEXT NOT NULL, bucket_ms REAL NOT NULL,
  bin INTEGER NOT NULL, cnt REAL NOT NULL, PRIMARY KEY (kind, bucket_ms, project, env, key, bin)
);
CREATE TABLE IF NOT EXISTS metric_${t} (
  project TEXT NOT NULL DEFAULT '', env TEXT NOT NULL DEFAULT '', series_key TEXT NOT NULL, name TEXT NOT NULL, bucket_ms REAL NOT NULL,
  cnt REAL NOT NULL, vsum REAL NOT NULL, vmin REAL, vmax REAL, first_ms REAL NOT NULL, first_v REAL, last_ms REAL NOT NULL, last_v REAL,
  rate_delta REAL NOT NULL DEFAULT 0, rate_ms REAL NOT NULL DEFAULT 0, h_count REAL NOT NULL DEFAULT 0, h_sum REAL NOT NULL DEFAULT 0,
  h_min REAL, h_max REAL, h_bounds TEXT, h_counts TEXT, PRIMARY KEY (name, bucket_ms, project, env, series_key)
);
CREATE INDEX IF NOT EXISTS ix_metric_${t}_time ON metric_${t} (bucket_ms);`;

// Hub trace ids are unique, so fact keys start with the trace id; project is a column the scope filters on.
export const HUB_SCALE_SCHEMA = `
CREATE INDEX IF NOT EXISTS ix_traces_dirty ON traces(start_ms) WHERE settled_ms < updated_ms;
CREATE TABLE IF NOT EXISTS fact_requests (
  project TEXT NOT NULL DEFAULT '', trace_id TEXT NOT NULL, env TEXT NOT NULL DEFAULT '', start_ms REAL NOT NULL,
  method TEXT NOT NULL, path TEXT NOT NULL, endpoint TEXT NOT NULL, status INTEGER, status_class TEXT NOT NULL, failed INTEGER NOT NULL,
  dur_class TEXT NOT NULL, aborted INTEGER NOT NULL, duration_ms REAL NOT NULL, server_ms REAL,
  db_ms REAL NOT NULL, db_count INTEGER NOT NULL, fetch_count INTEGER NOT NULL, fetch_ms REAL NOT NULL,
  render_ms REAL, network_ms REAL, service TEXT NOT NULL, services TEXT NOT NULL, errors INTEGER NOT NULL,
  insights INTEGER NOT NULL, health TEXT NOT NULL, user_agent TEXT, client_address TEXT, end_user TEXT, request_id TEXT,
  tags TEXT NOT NULL, search TEXT NOT NULL, PRIMARY KEY (trace_id)
);
CREATE INDEX IF NOT EXISTS ix_fact_requests_time ON fact_requests (start_ms);
CREATE INDEX IF NOT EXISTS ix_fact_requests_project ON fact_requests (project, start_ms);
CREATE TABLE IF NOT EXISTS fact_traces (
  project TEXT NOT NULL DEFAULT '', trace_id TEXT NOT NULL, env TEXT NOT NULL DEFAULT '', start_ms REAL NOT NULL, path TEXT NOT NULL,
  duration_ms REAL NOT NULL, health TEXT, status TEXT NOT NULL, services TEXT NOT NULL, span_count INTEGER NOT NULL,
  slow INTEGER NOT NULL, search TEXT NOT NULL, PRIMARY KEY (trace_id)
);
CREATE INDEX IF NOT EXISTS ix_fact_traces_time ON fact_traces (start_ms);
CREATE INDEX IF NOT EXISTS ix_fact_traces_project ON fact_traces (project, start_ms);
CREATE TABLE IF NOT EXISTS fact_logs (
  project TEXT NOT NULL DEFAULT '', trace_id TEXT NOT NULL, idx INTEGER NOT NULL, env TEXT NOT NULL DEFAULT '', time_ms REAL NOT NULL,
  level TEXT NOT NULL, level_rank INTEGER NOT NULL, service TEXT NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL,
  trace_name TEXT NOT NULL, span_id TEXT, attributes TEXT NOT NULL, search TEXT NOT NULL, pattern TEXT NOT NULL DEFAULT '', PRIMARY KEY (trace_id, idx)
);
CREATE INDEX IF NOT EXISTS ix_fact_logs_time ON fact_logs (time_ms);
CREATE INDEX IF NOT EXISTS ix_fact_logs_project ON fact_logs (project, time_ms);
CREATE TABLE IF NOT EXISTS fact_critical (
  project TEXT NOT NULL DEFAULT '', trace_id TEXT NOT NULL, span_id TEXT NOT NULL, env TEXT NOT NULL DEFAULT '', start_ms REAL NOT NULL,
  duration_ms REAL NOT NULL, name TEXT NOT NULL, service TEXT NOT NULL, layer TEXT NOT NULL, PRIMARY KEY (trace_id, span_id)
);
CREATE INDEX IF NOT EXISTS ix_fact_critical_time ON fact_critical (start_ms);
CREATE INDEX IF NOT EXISTS ix_fact_critical_project ON fact_critical (project, start_ms);
CREATE TABLE IF NOT EXISTS fact_search (
  project TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, trace_id TEXT NOT NULL, owner TEXT NOT NULL, env TEXT NOT NULL DEFAULT '', time_ms REAL NOT NULL,
  span_id TEXT, service TEXT NOT NULL, name TEXT, method TEXT, path TEXT, route TEXT, status INTEGER, outcome TEXT, duration_ms REAL,
  level_rank INTEGER, category TEXT, span_kind TEXT, end_user TEXT, error INTEGER NOT NULL, message TEXT, text TEXT NOT NULL,
  PRIMARY KEY (kind, trace_id, owner)
);
CREATE INDEX IF NOT EXISTS ix_fact_search_time ON fact_search (kind, time_ms);
CREATE INDEX IF NOT EXISTS ix_fact_search_project ON fact_search (project, kind, time_ms);
CREATE TABLE IF NOT EXISTS fact_attrs (
  project TEXT NOT NULL DEFAULT '', trace_id TEXT NOT NULL, src TEXT NOT NULL, owner TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, num REAL
);
CREATE INDEX IF NOT EXISTS ix_fact_attrs_trace ON fact_attrs (trace_id, src, owner, key);
CREATE INDEX IF NOT EXISTS ix_fact_attrs_key ON fact_attrs (key, value);
CREATE TABLE IF NOT EXISTS metric_series (
  project TEXT NOT NULL DEFAULT '', env TEXT NOT NULL DEFAULT '', series_key TEXT NOT NULL, name TEXT NOT NULL, service TEXT NOT NULL,
  kind TEXT NOT NULL, unit TEXT NOT NULL, description TEXT NOT NULL, monotonic INTEGER NOT NULL, temporality TEXT NOT NULL,
  attributes TEXT NOT NULL, last_ms REAL NOT NULL, last_value REAL, last_hist TEXT, PRIMARY KEY (project, env, series_key)
);
CREATE INDEX IF NOT EXISTS ix_metric_series_name ON metric_series (name);
CREATE INDEX IF NOT EXISTS ix_metric_series_project ON metric_series (project, name);
${TIERS.map(rollupTable).join("\n")}
`;

/** Tables the stats rebuild clears. */
export const STATS_TABLES = ["fact_requests", "fact_traces", "fact_logs", "fact_critical", "fact_search", "fact_attrs", ...TIERS.flatMap((t) => [`rollup_${t}`, `hist_${t}`])];

const setMeta = (db: DatabaseSync, key: string, value: string) => db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);

/** Clear facts and rollups and mark every trace unsettled, so the settle job rebuilds them. */
function rebuildStats(db: DatabaseSync): void {
  db.exec("BEGIN");
  try {
    for (const t of STATS_TABLES) db.exec(`DELETE FROM ${t}`);
    db.exec("UPDATE traces SET settled_ms = 0, contrib = NULL");
    setMeta(db, "facts", String(FACTS_VERSION));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Bring any hub file to the current schema. Older files gain the stats tables; the settle job then backfills them. */
export function upgradeHubSchema(db: DatabaseSync): void {
  db.exec(HUB_SCHEMA);
  const cols = new Set((db.prepare("PRAGMA table_info(traces)").all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("settled_ms")) db.exec("ALTER TABLE traces ADD COLUMN settled_ms REAL NOT NULL DEFAULT 0");
  if (!cols.has("contrib")) db.exec("ALTER TABLE traces ADD COLUMN contrib TEXT");
  db.exec(HUB_SCALE_SCHEMA);
  db.exec(SAVED_SEARCH_SCHEMA);
  const logCols = new Set((db.prepare("PRAGMA table_info(fact_logs)").all() as { name: string }[]).map((c) => c.name));
  if (!logCols.has("pattern")) db.exec("ALTER TABLE fact_logs ADD COLUMN pattern TEXT NOT NULL DEFAULT ''");
  db.exec("CREATE INDEX IF NOT EXISTS ix_fact_logs_pattern ON fact_logs (pattern, time_ms)");
  upgradeFts(db);
  const facts = db.prepare("SELECT value FROM meta WHERE key = 'facts'").get() as { value: string } | undefined;
  if (facts?.value !== String(FACTS_VERSION)) rebuildStats(db);
  setMeta(db, "schema", HUB_SCHEMA_VERSION);
}
