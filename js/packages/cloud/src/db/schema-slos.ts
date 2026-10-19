// SLOs and Apdex targets per project, and alert rules that watch an SLO's burn rate.
export const SLOS_MIGRATION = `
CREATE TABLE slos (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE, name TEXT NOT NULL, service TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, target DOUBLE PRECISION NOT NULL, threshold_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  window_days INTEGER NOT NULL, created_by TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL
);
CREATE INDEX ix_slos_project ON slos (project_id);
CREATE TABLE apdex_targets (project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE, targets TEXT NOT NULL);
ALTER TABLE alert_rules ADD COLUMN slo_id TEXT NOT NULL DEFAULT '';
`;
