import { ALERTS2_MIGRATION } from "./schema-alerts.js";
import { AUTH_MIGRATION } from "./schema-auth.js";
import { LOGS_MIGRATION } from "./schema-logs.js";
import { BILLING_MIGRATION } from "./schema-billing.js";
import { MAIL_MIGRATION } from "./schema-mail.js";
import { NOTIFY_MIGRATION } from "./schema-notify.js";
import { ISSUES_MIGRATION } from "./schema-issues.js";
import { OAUTH_MIGRATION } from "./schema-oauth.js";
import { SAVED_MIGRATION, SAVED_ORG_MIGRATION } from "./schema-saved.js";
import { SCIM_MIGRATION } from "./schema-scim.js";
import { SEARCH_MIGRATION } from "./schema-search.js";
import { SOURCEMAPS_MIGRATION } from "./schema-sourcemaps.js";
import { SLOS_MIGRATION } from "./schema-slos.js";
import { SSO_MIGRATION } from "./schema-sso.js";
import { UPTIME_MIGRATION } from "./schema-uptime.js";
import { TAGS_MIGRATION } from "./schema-tags.js";
import { TEAM_MIGRATION } from "./schema-team.js";
import { SAVED_MOVE_MIGRATION } from "./schema-saved-move.js";
import { ORGS_MIGRATION, READER_MIGRATION } from "./schema-orgs.js";
import { PACKAGES_MIGRATION } from "./schema-packages.js";

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
  `
CREATE TABLE metric_points (
  project_id TEXT NOT NULL, time_ms DOUBLE PRECISION NOT NULL, env TEXT NOT NULL DEFAULT '', service TEXT NOT NULL,
  name TEXT NOT NULL, series_key TEXT NOT NULL, json TEXT NOT NULL
);
CREATE INDEX ix_metric_points_name ON metric_points (project_id, name, time_ms);
CREATE INDEX ix_metric_points_time ON metric_points (project_id, time_ms);
ALTER TABLE alert_rules ADD COLUMN metric_name TEXT NOT NULL DEFAULT '';
ALTER TABLE alert_rules ADD COLUMN metric_stat TEXT NOT NULL DEFAULT '';
ALTER TABLE alert_rules ADD COLUMN metric_service TEXT NOT NULL DEFAULT '';
`,
  `
ALTER TABLE traces ADD COLUMN settled_ms DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE traces ADD COLUMN contrib TEXT;
CREATE INDEX ix_traces_dirty ON traces (start_ms) WHERE settled_ms < updated_ms;
CREATE TABLE scale_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE fact_requests (
  project_id TEXT NOT NULL, trace_id TEXT NOT NULL, env TEXT NOT NULL DEFAULT '', start_ms DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL, path TEXT NOT NULL, endpoint TEXT NOT NULL, status INTEGER, status_class TEXT NOT NULL, failed BOOLEAN NOT NULL,
  dur_class TEXT NOT NULL, aborted BOOLEAN NOT NULL, duration_ms DOUBLE PRECISION NOT NULL, server_ms DOUBLE PRECISION,
  db_ms DOUBLE PRECISION NOT NULL, db_count INTEGER NOT NULL, fetch_count INTEGER NOT NULL, fetch_ms DOUBLE PRECISION NOT NULL,
  render_ms DOUBLE PRECISION, network_ms DOUBLE PRECISION, service TEXT NOT NULL, services TEXT NOT NULL, errors INTEGER NOT NULL,
  insights INTEGER NOT NULL, health TEXT NOT NULL, user_agent TEXT, client_address TEXT, end_user TEXT, request_id TEXT,
  tags TEXT NOT NULL, search TEXT NOT NULL, PRIMARY KEY (project_id, trace_id)
);
CREATE INDEX ix_fact_requests_time ON fact_requests (project_id, start_ms);
CREATE TABLE fact_traces (
  project_id TEXT NOT NULL, trace_id TEXT NOT NULL, env TEXT NOT NULL DEFAULT '', start_ms DOUBLE PRECISION NOT NULL, path TEXT NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL, health TEXT, status TEXT NOT NULL, services TEXT NOT NULL, span_count INTEGER NOT NULL,
  slow BOOLEAN NOT NULL, search TEXT NOT NULL, PRIMARY KEY (project_id, trace_id)
);
CREATE INDEX ix_fact_traces_time ON fact_traces (project_id, start_ms);
CREATE TABLE fact_logs (
  project_id TEXT NOT NULL, trace_id TEXT NOT NULL, idx INTEGER NOT NULL, env TEXT NOT NULL DEFAULT '', time_ms DOUBLE PRECISION NOT NULL,
  level TEXT NOT NULL, level_rank SMALLINT NOT NULL, service TEXT NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL,
  trace_name TEXT NOT NULL, span_id TEXT, attributes TEXT NOT NULL, search TEXT NOT NULL, PRIMARY KEY (project_id, trace_id, idx)
);
CREATE INDEX ix_fact_logs_time ON fact_logs (project_id, time_ms);
CREATE TABLE fact_critical (
  project_id TEXT NOT NULL, trace_id TEXT NOT NULL, span_id TEXT NOT NULL, env TEXT NOT NULL DEFAULT '', start_ms DOUBLE PRECISION NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL, name TEXT NOT NULL, service TEXT NOT NULL, layer TEXT NOT NULL, PRIMARY KEY (project_id, trace_id, span_id)
);
CREATE INDEX ix_fact_critical_time ON fact_critical (project_id, start_ms);
CREATE INDEX ix_fact_critical_slow ON fact_critical (project_id, duration_ms);
CREATE TABLE rollup_10s (
  project_id TEXT NOT NULL, env TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, bucket_ms DOUBLE PRECISION NOT NULL,
  n DOUBLE PRECISION NOT NULL, err DOUBLE PRECISION NOT NULL, sum_v DOUBLE PRECISION NOT NULL,
  c0 DOUBLE PRECISION NOT NULL DEFAULT 0, c1 DOUBLE PRECISION NOT NULL DEFAULT 0, c2 DOUBLE PRECISION NOT NULL DEFAULT 0,
  c3 DOUBLE PRECISION NOT NULL DEFAULT 0, c4 DOUBLE PRECISION NOT NULL DEFAULT 0, c5 DOUBLE PRECISION NOT NULL DEFAULT 0,
  first_ms DOUBLE PRECISION NOT NULL, last_ms DOUBLE PRECISION NOT NULL, top_rank DOUBLE PRECISION NOT NULL DEFAULT 0,
  top TEXT, ids TEXT NOT NULL DEFAULT '', PRIMARY KEY (project_id, kind, bucket_ms, env, key)
);
CREATE INDEX ix_rollup_10s_key ON rollup_10s (project_id, kind, key, bucket_ms);
CREATE TABLE rollup_5m (
  project_id TEXT NOT NULL, env TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, bucket_ms DOUBLE PRECISION NOT NULL,
  n DOUBLE PRECISION NOT NULL, err DOUBLE PRECISION NOT NULL, sum_v DOUBLE PRECISION NOT NULL,
  c0 DOUBLE PRECISION NOT NULL DEFAULT 0, c1 DOUBLE PRECISION NOT NULL DEFAULT 0, c2 DOUBLE PRECISION NOT NULL DEFAULT 0,
  c3 DOUBLE PRECISION NOT NULL DEFAULT 0, c4 DOUBLE PRECISION NOT NULL DEFAULT 0, c5 DOUBLE PRECISION NOT NULL DEFAULT 0,
  first_ms DOUBLE PRECISION NOT NULL, last_ms DOUBLE PRECISION NOT NULL, top_rank DOUBLE PRECISION NOT NULL DEFAULT 0,
  top TEXT, ids TEXT NOT NULL DEFAULT '', PRIMARY KEY (project_id, kind, bucket_ms, env, key)
);
CREATE INDEX ix_rollup_5m_key ON rollup_5m (project_id, kind, key, bucket_ms);
CREATE TABLE rollup_1h (
  project_id TEXT NOT NULL, env TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, bucket_ms DOUBLE PRECISION NOT NULL,
  n DOUBLE PRECISION NOT NULL, err DOUBLE PRECISION NOT NULL, sum_v DOUBLE PRECISION NOT NULL,
  c0 DOUBLE PRECISION NOT NULL DEFAULT 0, c1 DOUBLE PRECISION NOT NULL DEFAULT 0, c2 DOUBLE PRECISION NOT NULL DEFAULT 0,
  c3 DOUBLE PRECISION NOT NULL DEFAULT 0, c4 DOUBLE PRECISION NOT NULL DEFAULT 0, c5 DOUBLE PRECISION NOT NULL DEFAULT 0,
  first_ms DOUBLE PRECISION NOT NULL, last_ms DOUBLE PRECISION NOT NULL, top_rank DOUBLE PRECISION NOT NULL DEFAULT 0,
  top TEXT, ids TEXT NOT NULL DEFAULT '', PRIMARY KEY (project_id, kind, bucket_ms, env, key)
);
CREATE INDEX ix_rollup_1h_key ON rollup_1h (project_id, kind, key, bucket_ms);
CREATE TABLE hist_10s (
  project_id TEXT NOT NULL, env TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, bucket_ms DOUBLE PRECISION NOT NULL,
  bin INTEGER NOT NULL, cnt DOUBLE PRECISION NOT NULL, PRIMARY KEY (project_id, kind, bucket_ms, env, key, bin)
);
CREATE TABLE hist_5m (
  project_id TEXT NOT NULL, env TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, bucket_ms DOUBLE PRECISION NOT NULL,
  bin INTEGER NOT NULL, cnt DOUBLE PRECISION NOT NULL, PRIMARY KEY (project_id, kind, bucket_ms, env, key, bin)
);
CREATE TABLE hist_1h (
  project_id TEXT NOT NULL, env TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, bucket_ms DOUBLE PRECISION NOT NULL,
  bin INTEGER NOT NULL, cnt DOUBLE PRECISION NOT NULL, PRIMARY KEY (project_id, kind, bucket_ms, env, key, bin)
);
CREATE TABLE metric_series (
  project_id TEXT NOT NULL, env TEXT NOT NULL, series_key TEXT NOT NULL, name TEXT NOT NULL, service TEXT NOT NULL, kind TEXT NOT NULL,
  unit TEXT NOT NULL, description TEXT NOT NULL, monotonic BOOLEAN NOT NULL, temporality TEXT NOT NULL, attributes TEXT NOT NULL,
  last_ms DOUBLE PRECISION NOT NULL, last_value DOUBLE PRECISION, last_hist TEXT, PRIMARY KEY (project_id, env, series_key)
);
CREATE INDEX ix_metric_series_name ON metric_series (project_id, name);
CREATE TABLE metric_10s (
  project_id TEXT NOT NULL, env TEXT NOT NULL, series_key TEXT NOT NULL, name TEXT NOT NULL, bucket_ms DOUBLE PRECISION NOT NULL,
  cnt DOUBLE PRECISION NOT NULL, vsum DOUBLE PRECISION NOT NULL, vmin DOUBLE PRECISION, vmax DOUBLE PRECISION,
  first_ms DOUBLE PRECISION NOT NULL, first_v DOUBLE PRECISION, last_ms DOUBLE PRECISION NOT NULL, last_v DOUBLE PRECISION,
  rate_delta DOUBLE PRECISION NOT NULL DEFAULT 0, rate_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  h_count DOUBLE PRECISION NOT NULL DEFAULT 0, h_sum DOUBLE PRECISION NOT NULL DEFAULT 0, h_min DOUBLE PRECISION, h_max DOUBLE PRECISION,
  h_bounds TEXT, h_counts TEXT, PRIMARY KEY (project_id, name, bucket_ms, env, series_key)
);
CREATE TABLE metric_5m (
  project_id TEXT NOT NULL, env TEXT NOT NULL, series_key TEXT NOT NULL, name TEXT NOT NULL, bucket_ms DOUBLE PRECISION NOT NULL,
  cnt DOUBLE PRECISION NOT NULL, vsum DOUBLE PRECISION NOT NULL, vmin DOUBLE PRECISION, vmax DOUBLE PRECISION,
  first_ms DOUBLE PRECISION NOT NULL, first_v DOUBLE PRECISION, last_ms DOUBLE PRECISION NOT NULL, last_v DOUBLE PRECISION,
  rate_delta DOUBLE PRECISION NOT NULL DEFAULT 0, rate_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  h_count DOUBLE PRECISION NOT NULL DEFAULT 0, h_sum DOUBLE PRECISION NOT NULL DEFAULT 0, h_min DOUBLE PRECISION, h_max DOUBLE PRECISION,
  h_bounds TEXT, h_counts TEXT, PRIMARY KEY (project_id, name, bucket_ms, env, series_key)
);
CREATE TABLE metric_1h (
  project_id TEXT NOT NULL, env TEXT NOT NULL, series_key TEXT NOT NULL, name TEXT NOT NULL, bucket_ms DOUBLE PRECISION NOT NULL,
  cnt DOUBLE PRECISION NOT NULL, vsum DOUBLE PRECISION NOT NULL, vmin DOUBLE PRECISION, vmax DOUBLE PRECISION,
  first_ms DOUBLE PRECISION NOT NULL, first_v DOUBLE PRECISION, last_ms DOUBLE PRECISION NOT NULL, last_v DOUBLE PRECISION,
  rate_delta DOUBLE PRECISION NOT NULL DEFAULT 0, rate_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  h_count DOUBLE PRECISION NOT NULL DEFAULT 0, h_sum DOUBLE PRECISION NOT NULL DEFAULT 0, h_min DOUBLE PRECISION, h_max DOUBLE PRECISION,
  h_bounds TEXT, h_counts TEXT, PRIMARY KEY (project_id, name, bucket_ms, env, series_key)
);
CREATE INDEX ix_metric_10s_time ON metric_10s (project_id, bucket_ms);
CREATE INDEX ix_metric_5m_time ON metric_5m (project_id, bucket_ms);
CREATE INDEX ix_metric_1h_time ON metric_1h (project_id, bucket_ms);
`,
  AUTH_MIGRATION,
  SSO_MIGRATION,
  MAIL_MIGRATION,
  NOTIFY_MIGRATION,
  SEARCH_MIGRATION,
  OAUTH_MIGRATION,
  ISSUES_MIGRATION,
  ALERTS2_MIGRATION,
  SLOS_MIGRATION,
  SAVED_MIGRATION,
  BILLING_MIGRATION,
  SCIM_MIGRATION,
  TAGS_MIGRATION,
  UPTIME_MIGRATION,
  SOURCEMAPS_MIGRATION,
  LOGS_MIGRATION,
  // Migration 20: an alert event names the problem it is part of (docs/CONTRACT.md, "Problems").
  `
ALTER TABLE alert_events ADD COLUMN problem TEXT NOT NULL DEFAULT '';
`,
  TEAM_MIGRATION,
  SAVED_MOVE_MIGRATION,
  ORGS_MIGRATION,
  READER_MIGRATION,
  SAVED_ORG_MIGRATION,
  PACKAGES_MIGRATION,
];

export const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS wizelens_migrations (version INTEGER PRIMARY KEY, applied_ms DOUBLE PRECISION NOT NULL)`;
