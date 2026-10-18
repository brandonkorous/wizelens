// Migration 8: search rows (one per request, trace, span, and log line) and attribute values, built when traces settle.
export const SEARCH_MIGRATION = `
CREATE TABLE fact_search (
  project_id TEXT NOT NULL, kind TEXT NOT NULL, trace_id TEXT NOT NULL, owner TEXT NOT NULL, env TEXT NOT NULL DEFAULT '', time_ms DOUBLE PRECISION NOT NULL,
  span_id TEXT, service TEXT NOT NULL, name TEXT, method TEXT, path TEXT, route TEXT, status INTEGER, outcome TEXT, duration_ms DOUBLE PRECISION,
  level_rank SMALLINT, category TEXT, span_kind TEXT, end_user TEXT, error BOOLEAN NOT NULL, message TEXT, text TEXT NOT NULL,
  PRIMARY KEY (project_id, kind, trace_id, owner)
);
CREATE INDEX ix_fact_search_time ON fact_search (project_id, kind, time_ms);
CREATE TABLE fact_attrs (
  project_id TEXT NOT NULL, trace_id TEXT NOT NULL, src TEXT NOT NULL, owner TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, num DOUBLE PRECISION
);
CREATE INDEX ix_fact_attrs_trace ON fact_attrs (project_id, trace_id, src, owner, key);
CREATE INDEX ix_fact_attrs_key ON fact_attrs (project_id, key, value);
`;
