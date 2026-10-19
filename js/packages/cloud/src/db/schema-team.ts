// Project settings (thresholds, extra redacted keys, a shorter retention), roles per project, key expiry and scopes, and audit filters.
export const TEAM_MIGRATION = `
ALTER TABLE projects ADD COLUMN settings TEXT NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN retention_days INTEGER;
CREATE TABLE project_roles (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE, user_id TEXT NOT NULL, role TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX ix_project_roles_user ON project_roles (user_id);
ALTER TABLE api_keys ADD COLUMN expires_ms DOUBLE PRECISION;
ALTER TABLE api_keys ADD COLUMN scopes TEXT;
ALTER TABLE api_keys ADD COLUMN rotated_from TEXT;
CREATE INDEX ix_audit_org_action ON audit (org_id, action, time_ms);
`;
