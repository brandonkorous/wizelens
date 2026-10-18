// Migration 7: notices and digests. Old audit lines count as noticed, so an upgrade sends nothing for the past.
export const NOTIFY_MIGRATION = `
ALTER TABLE audit ADD COLUMN noticed BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE audit ALTER COLUMN noticed SET DEFAULT FALSE;
CREATE INDEX ix_audit_unnoticed ON audit (time_ms) WHERE NOT noticed;
CREATE TABLE mail_prefs (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, team BOOLEAN NOT NULL DEFAULT TRUE,
  health BOOLEAN NOT NULL DEFAULT TRUE, digests BOOLEAN NOT NULL DEFAULT TRUE, time_zone TEXT NOT NULL DEFAULT 'UTC', digest_hour SMALLINT NOT NULL DEFAULT 8
);
CREATE TABLE digest_prefs (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  daily BOOLEAN NOT NULL, weekly BOOLEAN NOT NULL, monthly BOOLEAN NOT NULL, PRIMARY KEY (user_id, project_id)
);
CREATE TABLE digest_sends (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  period TEXT NOT NULL, period_key TEXT NOT NULL, sent_ms DOUBLE PRECISION NOT NULL, PRIMARY KEY (user_id, project_id, period, period_key)
);
CREATE TABLE known_devices (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, device TEXT NOT NULL, first_ms DOUBLE PRECISION NOT NULL,
  last_ms DOUBLE PRECISION NOT NULL, PRIMARY KEY (user_id, device)
);
CREATE TABLE project_health (
  project_id TEXT NOT NULL PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE, quiet BOOLEAN NOT NULL, changed_ms DOUBLE PRECISION NOT NULL
);
`;
