import type { DatabaseSync, StatementSync } from "node:sqlite";

// Shared schema (docs/CONTRACT.md, "Storage"). The phase 2 hub reads these files too.
export const SCHEMA_VERSION = "1";
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta   (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY, start_ms REAL NOT NULL, updated_ms REAL NOT NULL,
  remotes TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS spans  (
  trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT,
  name TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL, service TEXT NOT NULL,
  start_ms REAL NOT NULL, duration_ms REAL NOT NULL, status TEXT NOT NULL,
  session TEXT,
  json TEXT NOT NULL,
  PRIMARY KEY (trace_id, span_id)
);
CREATE TABLE IF NOT EXISTS logs   (
  trace_id TEXT NOT NULL, seq INTEGER NOT NULL, time_ms REAL NOT NULL, level TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (trace_id, seq)
);
CREATE INDEX IF NOT EXISTS ix_traces_start  ON traces(start_ms);
CREATE INDEX IF NOT EXISTS ix_spans_session ON spans(session) WHERE session IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_spans_cat_dur ON spans(category, duration_ms);
`;

export interface Statements {
  upsertTrace: StatementSync;
  upsertSpan: StatementSync;
  insertLog: StatementSync;
  pruneAge: StatementSync;
  pruneCount: StatementSync;
  pruneSpans: StatementSync;
  pruneLogs: StatementSync;
}

export function prepareStatements(db: DatabaseSync): Statements {
  return {
    upsertTrace: db.prepare(`INSERT INTO traces (trace_id, start_ms, updated_ms, remotes) VALUES (?, ?, ?, ?)
      ON CONFLICT(trace_id) DO UPDATE SET start_ms = min(start_ms, excluded.start_ms),
        updated_ms = excluded.updated_ms, remotes = excluded.remotes`),
    upsertSpan: db.prepare(`INSERT OR REPLACE INTO spans
      (trace_id, span_id, parent_span_id, name, kind, category, service, start_ms, duration_ms, status, session, json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    insertLog: db.prepare("INSERT OR IGNORE INTO logs (trace_id, seq, time_ms, level, json) VALUES (?, ?, ?, ?, ?)"),
    pruneAge: db.prepare("DELETE FROM traces WHERE start_ms < ?"),
    pruneCount: db.prepare(
      "DELETE FROM traces WHERE trace_id NOT IN (SELECT trace_id FROM traces ORDER BY start_ms DESC LIMIT ?)",
    ),
    pruneSpans: db.prepare("DELETE FROM spans WHERE trace_id NOT IN (SELECT trace_id FROM traces)"),
    pruneLogs: db.prepare("DELETE FROM logs WHERE trace_id NOT IN (SELECT trace_id FROM traces)"),
  };
}
