// Migration 10: issue states. Error groups and insights a person resolved, ignored, or assigned, per project.
export const ISSUES_MIGRATION = `
CREATE TABLE issues (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE, kind TEXT NOT NULL, key TEXT NOT NULL,
  status TEXT NOT NULL, until_ms DOUBLE PRECISION, resolved_ms DOUBLE PRECISION, assignee TEXT,
  updated_ms DOUBLE PRECISION NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY (project_id, kind, key)
);
`;
