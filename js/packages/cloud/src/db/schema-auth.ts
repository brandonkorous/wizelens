// Migration 4: accounts move to Better Auth (names in auth/schema-names.ts). Rows and ids stay; sessions start over; invites get new links.
export const AUTH_MIGRATION = `
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN image TEXT;
ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE;
UPDATE users SET email = lower(email), email_verified = TRUE, created_at = to_timestamp(created_ms / 1000.0), updated_at = to_timestamp(created_ms / 1000.0);
CREATE TABLE accounts (
  id TEXT NOT NULL PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, access_token TEXT, refresh_token TEXT, id_token TEXT,
  access_token_expires_at TIMESTAMPTZ, refresh_token_expires_at TIMESTAMPTZ, scope TEXT, password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX accounts_user_id_idx ON accounts (user_id);
CREATE UNIQUE INDEX ux_accounts_provider_account ON accounts (provider_id, account_id);
INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
  SELECT gen_random_uuid()::text, id, 'credential', id, password_hash, created_at, CURRENT_TIMESTAMP FROM users;
ALTER TABLE users DROP COLUMN password_hash;
ALTER TABLE users DROP COLUMN created_ms;
DROP TABLE sessions;
CREATE TABLE sessions (
  id TEXT NOT NULL PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL, token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL, ip_address TEXT, user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, active_org_id TEXT
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
ALTER TABLE orgs ADD COLUMN logo TEXT;
ALTER TABLE orgs ADD COLUMN metadata TEXT;
ALTER TABLE orgs ADD COLUMN created_at TIMESTAMPTZ;
UPDATE orgs SET created_at = to_timestamp(created_ms / 1000.0);
ALTER TABLE orgs ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE orgs DROP COLUMN created_ms;
ALTER TABLE members ADD COLUMN id TEXT;
ALTER TABLE members ADD COLUMN created_at TIMESTAMPTZ;
UPDATE members SET id = gen_random_uuid()::text, created_at = to_timestamp(created_ms / 1000.0);
ALTER TABLE members DROP CONSTRAINT members_pkey;
ALTER TABLE members ALTER COLUMN id SET NOT NULL;
ALTER TABLE members ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE members DROP COLUMN created_ms;
ALTER TABLE members ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX ux_members_org_user ON members (org_id, user_id);
CREATE INDEX members_org_id_idx ON members (org_id);
CREATE INDEX members_user_id_idx ON members (user_id);
DROP INDEX ix_members_user;
ALTER TABLE invites RENAME TO legacy_invites;
CREATE TABLE invites (
  id TEXT NOT NULL PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs (id) ON DELETE CASCADE, email TEXT NOT NULL, role TEXT,
  status TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  inviter_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX invites_org_id_idx ON invites (org_id);
CREATE INDEX invites_email_idx ON invites (email);
INSERT INTO invites (id, org_id, email, role, status, expires_at, created_at, inviter_id)
  SELECT gen_random_uuid()::text, i.org_id, lower(i.email), i.role, 'pending', to_timestamp(i.expires_ms / 1000.0), to_timestamp(i.created_ms / 1000.0),
    COALESCE((SELECT u.id FROM users u WHERE u.id = i.created_by),
      (SELECT m.user_id FROM members m WHERE m.org_id = i.org_id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1))
  FROM legacy_invites i
  WHERE i.accepted_ms IS NULL AND i.expires_ms > extract(epoch FROM CURRENT_TIMESTAMP) * 1000
    AND EXISTS (SELECT 1 FROM members m WHERE m.org_id = i.org_id AND m.role = 'owner');
DROP TABLE legacy_invites;
CREATE TABLE verifications (
  id TEXT NOT NULL PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX verifications_identifier_idx ON verifications (identifier);
CREATE TABLE two_factors (
  id TEXT NOT NULL PRIMARY KEY, secret TEXT NOT NULL, backup_codes TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  verified BOOLEAN, failed_verification_count INTEGER, locked_until TIMESTAMPTZ
);
CREATE INDEX two_factors_secret_idx ON two_factors (secret);
CREATE INDEX two_factors_user_id_idx ON two_factors (user_id);
CREATE TABLE passkeys (
  id TEXT NOT NULL PRIMARY KEY, name TEXT, public_key TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL, counter INTEGER NOT NULL, device_type TEXT NOT NULL, backed_up BOOLEAN NOT NULL, transports TEXT,
  created_at TIMESTAMPTZ, aaguid TEXT
);
CREATE INDEX passkeys_user_id_idx ON passkeys (user_id);
CREATE INDEX passkeys_credential_id_idx ON passkeys (credential_id);
CREATE TABLE rate_limits (id TEXT NOT NULL PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, last_request BIGINT NOT NULL);
CREATE TABLE cloud_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE FUNCTION wl_org_keeps_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid TEXT := COALESCE(OLD.org_id, NEW.org_id);
BEGIN
  IF EXISTS (SELECT 1 FROM orgs WHERE id = oid) AND NOT EXISTS (SELECT 1 FROM members WHERE org_id = oid AND role = 'owner') THEN
    RAISE EXCEPTION 'organization % must keep at least one owner', oid USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER members_keep_owner AFTER UPDATE OR DELETE ON members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wl_org_keeps_owner();
`;
