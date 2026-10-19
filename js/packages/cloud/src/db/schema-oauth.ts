// Migration 9: OAuth for MCP clients (Better Auth's OAuth provider; names in auth/oauth-names.ts) and the grants behind each consent.
export const OAUTH_MIGRATION = `
CREATE TABLE oauth_clients (
  id TEXT NOT NULL PRIMARY KEY, client_id TEXT NOT NULL UNIQUE, client_secret TEXT, client_discovery_id TEXT, disabled BOOLEAN,
  skip_consent BOOLEAN, enable_end_session BOOLEAN, subject_type TEXT, scopes JSONB, client_credentials_scopes JSONB,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, name TEXT, uri TEXT, icon TEXT,
  contacts JSONB, tos TEXT, policy TEXT, software_id TEXT, software_version TEXT, software_statement TEXT, redirect_uris JSONB NOT NULL,
  post_logout_redirect_uris JSONB, backchannel_logout_uri TEXT, backchannel_logout_session_required BOOLEAN, token_endpoint_auth_method TEXT,
  application_type TEXT, jwks TEXT, jwks_uri TEXT, grant_types JSONB, response_types JSONB, require_pkce BOOLEAN,
  dpop_bound_access_tokens BOOLEAN, reference_id TEXT, metadata JSONB
);
CREATE INDEX oauth_clients_user_id_idx ON oauth_clients (user_id);
CREATE TABLE oauth_resources (
  id TEXT NOT NULL PRIMARY KEY, identifier TEXT NOT NULL UNIQUE, name TEXT NOT NULL, access_token_ttl INTEGER, refresh_token_ttl INTEGER,
  signing_algorithm TEXT, signing_key_id TEXT, allowed_scopes JSONB, custom_claims JSONB, dpop_bound_access_tokens_required BOOLEAN,
  disabled BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, policy_version INTEGER, metadata JSONB
);
CREATE TABLE oauth_client_resources (
  id TEXT NOT NULL PRIMARY KEY, client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES oauth_resources (identifier) ON DELETE CASCADE, metadata JSONB, created_at TIMESTAMPTZ
);
CREATE INDEX oauth_client_resources_client_id_idx ON oauth_client_resources (client_id);
CREATE INDEX oauth_client_resources_resource_id_idx ON oauth_client_resources (resource_id);
CREATE UNIQUE INDEX oauth_client_resources_client_id_resource_id_uidx ON oauth_client_resources (client_id, resource_id);
CREATE TABLE oauth_refresh_tokens (
  id TEXT NOT NULL PRIMARY KEY, token TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions (id) ON DELETE SET NULL, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reference_id TEXT, authorization_code_id TEXT, resources JSONB, requested_user_info_claims JSONB, expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, revoked TIMESTAMPTZ, rotated_at TIMESTAMPTZ, rotation_replay_response TEXT,
  rotation_replay_expires_at TIMESTAMPTZ, auth_time TIMESTAMPTZ, confirmation JSONB, scopes JSONB NOT NULL
);
CREATE INDEX oauth_refresh_tokens_client_id_idx ON oauth_refresh_tokens (client_id);
CREATE INDEX oauth_refresh_tokens_session_id_idx ON oauth_refresh_tokens (session_id);
CREATE INDEX oauth_refresh_tokens_user_id_idx ON oauth_refresh_tokens (user_id);
CREATE INDEX oauth_refresh_tokens_authorization_code_id_idx ON oauth_refresh_tokens (authorization_code_id);
CREATE INDEX oauth_refresh_tokens_reference_id_idx ON oauth_refresh_tokens (reference_id);
CREATE TABLE oauth_access_tokens (
  id TEXT NOT NULL PRIMARY KEY, token TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions (id) ON DELETE SET NULL, user_id TEXT REFERENCES users (id) ON DELETE CASCADE, reference_id TEXT,
  authorization_code_id TEXT, resources JSONB, requested_user_info_claims JSONB,
  refresh_id TEXT REFERENCES oauth_refresh_tokens (id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  revoked TIMESTAMPTZ, confirmation JSONB, scopes JSONB NOT NULL
);
CREATE INDEX oauth_access_tokens_client_id_idx ON oauth_access_tokens (client_id);
CREATE INDEX oauth_access_tokens_session_id_idx ON oauth_access_tokens (session_id);
CREATE INDEX oauth_access_tokens_user_id_idx ON oauth_access_tokens (user_id);
CREATE INDEX oauth_access_tokens_authorization_code_id_idx ON oauth_access_tokens (authorization_code_id);
CREATE INDEX oauth_access_tokens_refresh_id_idx ON oauth_access_tokens (refresh_id);
CREATE INDEX oauth_access_tokens_reference_id_idx ON oauth_access_tokens (reference_id);
CREATE TABLE oauth_consents (
  id TEXT NOT NULL PRIMARY KEY, client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE, reference_id TEXT, resources JSONB, requested_user_info_claims JSONB,
  scopes JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX oauth_consents_client_id_idx ON oauth_consents (client_id);
CREATE INDEX oauth_consents_user_id_idx ON oauth_consents (user_id);
CREATE INDEX oauth_consents_reference_id_idx ON oauth_consents (reference_id);
CREATE TABLE oauth_client_assertions (id TEXT NOT NULL PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE oauth_grants (
  id TEXT NOT NULL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs (id) ON DELETE CASCADE, client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  session_id TEXT, all_projects BOOLEAN NOT NULL, project_ids TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL,
  used_ms DOUBLE PRECISION, revoked_ms DOUBLE PRECISION
);
CREATE INDEX ix_oauth_grants_user ON oauth_grants (user_id, client_id);
CREATE INDEX ix_oauth_grants_org ON oauth_grants (org_id);
CREATE INDEX ix_oauth_grants_session ON oauth_grants (session_id);
`;
