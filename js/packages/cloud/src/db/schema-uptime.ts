// Migration 14: uptime checks, their incidents, and public status pages. Results are spans of the wizelens-uptime service.
export const UPTIME_MIGRATION = `
CREATE TABLE uptime_checks (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE, name TEXT NOT NULL, url TEXT NOT NULL,
  method TEXT NOT NULL, headers TEXT NOT NULL, expect_status TEXT NOT NULL, expect_body TEXT NOT NULL, interval_min INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL, env TEXT NOT NULL DEFAULT '', enabled BOOLEAN NOT NULL, created_by TEXT NOT NULL,
  created_ms DOUBLE PRECISION NOT NULL, state TEXT NOT NULL DEFAULT 'pending', last_run_ms DOUBLE PRECISION,
  last_duration_ms DOUBLE PRECISION, last_status INTEGER, last_error TEXT, tls_expires_ms DOUBLE PRECISION, next_ms DOUBLE PRECISION NOT NULL
);
CREATE INDEX ix_uptime_checks_project ON uptime_checks (project_id);
CREATE INDEX ix_uptime_checks_due ON uptime_checks (next_ms) WHERE enabled;
CREATE TABLE uptime_incidents (
  id TEXT PRIMARY KEY, check_id TEXT NOT NULL REFERENCES uptime_checks (id) ON DELETE CASCADE, project_id TEXT NOT NULL,
  start_ms DOUBLE PRECISION NOT NULL, end_ms DOUBLE PRECISION, reason TEXT NOT NULL
);
CREATE INDEX ix_uptime_incidents_project ON uptime_incidents (project_id, start_ms);
CREATE TABLE status_pages (
  project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  created_by TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL, views INTEGER NOT NULL DEFAULT 0
);
`;
