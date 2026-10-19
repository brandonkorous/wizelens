// Migration 16: tag rules per project, and the built-in tags a project turned off (docs/TAGS-PLAN.md). Settings, never telemetry.
export const TAGS_MIGRATION = `
CREATE TABLE tag_rules (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL,
  query TEXT NOT NULL, created_by TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL, updated_ms DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (project_id, id), UNIQUE (project_id, name)
);
CREATE TABLE tag_builtins (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, enabled BOOLEAN NOT NULL, PRIMARY KEY (project_id, name)
);
`;
