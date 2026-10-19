// Migration 19: logs as a product. Pattern ids on log facts, log retention per project, log alert searches, and saved searches.
export const LOGS_MIGRATION = `
ALTER TABLE fact_logs ADD COLUMN pattern TEXT NOT NULL DEFAULT '';
CREATE INDEX ix_fact_logs_pattern ON fact_logs (project_id, pattern, time_ms);
ALTER TABLE projects ADD COLUMN log_retention_days INTEGER;
ALTER TABLE alert_rules ADD COLUMN log_search TEXT NOT NULL DEFAULT '{}';
CREATE TABLE saved_searches (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE, kind TEXT NOT NULL, name TEXT NOT NULL,
  params TEXT NOT NULL, created_by TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL
);
CREATE INDEX ix_saved_searches_project ON saved_searches (project_id, kind, created_ms);
`;
