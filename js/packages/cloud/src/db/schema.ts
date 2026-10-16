// Cloud schema, one entry per version. Never edit a shipped entry: add a new one (docs/CONTRACT.md, "Cloud storage").
export const MIGRATIONS: readonly string[] = [
  `
CREATE TABLE orgs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL DEFAULT 30, created_ms DOUBLE PRECISION NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  created_ms DOUBLE PRECISION NOT NULL
);
CREATE TABLE members (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL, PRIMARY KEY (org_id, user_id)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_ms DOUBLE PRECISION NOT NULL, expires_ms DOUBLE PRECISION NOT NULL
);
CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, email TEXT NOT NULL,
  role TEXT NOT NULL, created_by TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL,
  expires_ms DOUBLE PRECISION NOT NULL, accepted_ms DOUBLE PRECISION
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, name TEXT NOT NULL, slug TEXT NOT NULL,
  created_ms DOUBLE PRECISION NOT NULL, UNIQUE (org_id, slug)
);
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  project_ids TEXT NOT NULL, name TEXT NOT NULL, prefix TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL, last_used_ms DOUBLE PRECISION, revoked_ms DOUBLE PRECISION
);
CREATE TABLE traces (
  project_id TEXT NOT NULL, trace_id TEXT NOT NULL, start_ms DOUBLE PRECISION NOT NULL, end_ms DOUBLE PRECISION NOT NULL,
  updated_ms DOUBLE PRECISION NOT NULL, env TEXT NOT NULL DEFAULT '', PRIMARY KEY (project_id, trace_id)
);
CREATE TABLE spans (
  project_id TEXT NOT NULL, trace_id TEXT NOT NULL, span_id TEXT NOT NULL, service TEXT NOT NULL,
  start_ms DOUBLE PRECISION NOT NULL, duration_ms DOUBLE PRECISION NOT NULL, session TEXT, json TEXT NOT NULL,
  PRIMARY KEY (project_id, trace_id, span_id)
);
CREATE TABLE logs (
  project_id TEXT NOT NULL, trace_id TEXT NOT NULL, key TEXT NOT NULL, time_ms DOUBLE PRECISION NOT NULL, json TEXT NOT NULL,
  PRIMARY KEY (project_id, trace_id, key)
);
CREATE TABLE services (
  project_id TEXT NOT NULL, service TEXT NOT NULL, environment TEXT NOT NULL, host TEXT NOT NULL, via TEXT NOT NULL,
  info TEXT NOT NULL, first_seen DOUBLE PRECISION NOT NULL, last_seen DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (project_id, service, environment, host)
);
CREATE TABLE alert_rules (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL,
  metric TEXT NOT NULL, op TEXT NOT NULL, threshold DOUBLE PRECISION NOT NULL, window_ms DOUBLE PRECISION NOT NULL,
  env TEXT NOT NULL DEFAULT '', channels TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
  state TEXT NOT NULL DEFAULT 'ok', last_value DOUBLE PRECISION, last_eval_ms DOUBLE PRECISION,
  created_by TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL
);
CREATE TABLE alert_events (
  id TEXT PRIMARY KEY, rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE, project_id TEXT NOT NULL,
  kind TEXT NOT NULL, value DOUBLE PRECISION, threshold DOUBLE PRECISION NOT NULL, message TEXT NOT NULL,
  time_ms DOUBLE PRECISION NOT NULL, delivery TEXT NOT NULL DEFAULT ''
);
CREATE TABLE shares (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, trace_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL,
  expires_ms DOUBLE PRECISION NOT NULL, revoked_ms DOUBLE PRECISION, views INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE audit (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL,
  time_ms DOUBLE PRECISION NOT NULL
);
CREATE INDEX ix_traces_updated ON traces (project_id, updated_ms);
CREATE INDEX ix_traces_start ON traces (project_id, start_ms);
CREATE INDEX ix_traces_start_all ON traces (start_ms);
CREATE INDEX ix_spans_session ON spans (project_id, session) WHERE session IS NOT NULL;
CREATE INDEX ix_alert_events_project ON alert_events (project_id, time_ms);
CREATE INDEX ix_audit_org ON audit (org_id, time_ms);
CREATE INDEX ix_members_user ON members (user_id);
`,
];

export const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS wizelens_migrations (version INTEGER PRIMARY KEY, applied_ms DOUBLE PRECISION NOT NULL)`;
