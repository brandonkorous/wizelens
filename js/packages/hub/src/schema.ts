import type { DatabaseSync, StatementSync } from "node:sqlite";

// The hub file (docs/CONTRACT.md, "Hub storage"). Empty strings stand for "unknown" so keys stay unique.
export const HUB_SCHEMA_VERSION = "2";
export const HUB_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY, start_ms REAL NOT NULL, end_ms REAL NOT NULL, updated_ms REAL NOT NULL,
  env TEXT NOT NULL DEFAULT '', project TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS spans (
  trace_id TEXT NOT NULL, span_id TEXT NOT NULL, service TEXT NOT NULL, start_ms REAL NOT NULL,
  duration_ms REAL NOT NULL, session TEXT, json TEXT NOT NULL, PRIMARY KEY (trace_id, span_id)
);
CREATE TABLE IF NOT EXISTS logs (
  trace_id TEXT NOT NULL, key TEXT NOT NULL, time_ms REAL NOT NULL, json TEXT NOT NULL, PRIMARY KEY (trace_id, key)
);
CREATE TABLE IF NOT EXISTS remotes (trace_id TEXT NOT NULL, endpoint TEXT NOT NULL, PRIMARY KEY (trace_id, endpoint));
CREATE TABLE IF NOT EXISTS services (
  project TEXT NOT NULL, service TEXT NOT NULL, environment TEXT NOT NULL, host TEXT NOT NULL, via TEXT NOT NULL, info TEXT NOT NULL,
  first_seen REAL NOT NULL, last_seen REAL NOT NULL, PRIMARY KEY (project, service, environment, host)
);
CREATE TABLE IF NOT EXISTS metrics (
  time_ms REAL NOT NULL, project TEXT NOT NULL DEFAULT '', env TEXT NOT NULL DEFAULT '', service TEXT NOT NULL,
  name TEXT NOT NULL, series_key TEXT NOT NULL, json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_metrics_time ON metrics(time_ms);
CREATE INDEX IF NOT EXISTS ix_metrics_name ON metrics(name, time_ms);
CREATE INDEX IF NOT EXISTS ix_metrics_project ON metrics(project, time_ms);
CREATE INDEX IF NOT EXISTS ix_traces_updated ON traces(updated_ms);
CREATE INDEX IF NOT EXISTS ix_traces_start ON traces(start_ms);
CREATE INDEX IF NOT EXISTS ix_traces_env ON traces(env, start_ms);
CREATE INDEX IF NOT EXISTS ix_traces_project ON traces(project, start_ms);
CREATE INDEX IF NOT EXISTS ix_spans_session ON spans(session) WHERE session IS NOT NULL;
`;

export interface HubStatements {
  upsertTrace: StatementSync;
  upsertSpan: StatementSync;
  insertLog: StatementSync;
  insertRemote: StatementSync;
  upsertService: StatementSync;
  insertMetric: StatementSync;
}

export function prepareHubStatements(db: DatabaseSync): HubStatements {
  return {
    upsertTrace: db.prepare(`INSERT INTO traces (trace_id, start_ms, end_ms, updated_ms, env, project) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(trace_id) DO UPDATE SET start_ms = min(start_ms, excluded.start_ms), end_ms = max(end_ms, excluded.end_ms),
        updated_ms = excluded.updated_ms, env = CASE WHEN env = '' THEN excluded.env ELSE env END,
        project = CASE WHEN project = '' THEN excluded.project ELSE project END`),
    upsertSpan: db.prepare(`INSERT OR REPLACE INTO spans (trace_id, span_id, service, start_ms, duration_ms, session, json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    insertLog: db.prepare("INSERT OR IGNORE INTO logs (trace_id, key, time_ms, json) VALUES (?, ?, ?, ?)"),
    insertRemote: db.prepare("INSERT OR IGNORE INTO remotes (trace_id, endpoint) VALUES (?, ?)"),
    insertMetric: db.prepare("INSERT INTO metrics (time_ms, project, env, service, name, series_key, json) VALUES (?, ?, ?, ?, ?, ?, ?)"),
    upsertService: db.prepare(`INSERT INTO services (project, service, environment, host, via, info, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project, service, environment, host) DO UPDATE SET via = excluded.via, info = excluded.info, last_seen = excluded.last_seen`),
  };
}
