// Migration 15: SCIM provisioning (Better Auth's SCIM plugin, tables renamed to snake_case in auth/scim.ts). Tokens are in scim_tokens.
export const SCIM_MIGRATION = `
CREATE TABLE scim_connection_bindings (id TEXT NOT NULL PRIMARY KEY, connection_id TEXT NOT NULL, connection_key TEXT NOT NULL UNIQUE, provisioning_domain_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, decommissioned_at TIMESTAMPTZ, decommission_status TEXT NOT NULL, decommission_cursor_user_id TEXT, decommission_reconciled_user_count INTEGER NOT NULL, decommission_batch_count INTEGER NOT NULL, decommission_revision INTEGER NOT NULL, decommission_completed_at TIMESTAMPTZ, decommission_lease_id TEXT, decommission_lease_expires_at TIMESTAMPTZ);
CREATE TABLE scim_identity_tombstones (id TEXT NOT NULL PRIMARY KEY, connection_id TEXT NOT NULL, provisioning_domain_id TEXT NOT NULL, external_id TEXT NOT NULL, external_id_key TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, profile TEXT NOT NULL, deleted_at TIMESTAMPTZ NOT NULL);
CREATE TABLE scim_subjects (id TEXT NOT NULL PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE, profile_source_id TEXT, revision INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE scim_users (id TEXT NOT NULL PRIMARY KEY, connection_id TEXT NOT NULL, provisioning_domain_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, connection_user_key TEXT NOT NULL UNIQUE, user_name TEXT NOT NULL, user_name_key TEXT NOT NULL UNIQUE, primary_email TEXT NOT NULL, work_email_value_index TEXT NOT NULL, email_value_index TEXT NOT NULL, display_name TEXT NOT NULL, formatted_name TEXT NOT NULL, given_name TEXT, family_name TEXT, serialized_emails TEXT NOT NULL, serialized_attributes TEXT, external_id TEXT, external_id_key TEXT UNIQUE, active BOOLEAN NOT NULL, order_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE scim_projection_grants (id TEXT NOT NULL PRIMARY KEY, connection_id TEXT NOT NULL, provisioning_domain_id TEXT NOT NULL, scim_user_id TEXT NOT NULL REFERENCES scim_users (id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, source_kind TEXT NOT NULL, source_id TEXT NOT NULL, source_value TEXT, role TEXT NOT NULL, grant_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE scim_groups (id TEXT NOT NULL PRIMARY KEY, connection_id TEXT NOT NULL, provisioning_domain_id TEXT NOT NULL, revision INTEGER NOT NULL, display_name TEXT NOT NULL, display_name_key TEXT NOT NULL UNIQUE, external_id TEXT, external_id_key TEXT UNIQUE, order_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE scim_group_members (id TEXT NOT NULL PRIMARY KEY, connection_id TEXT NOT NULL, group_id TEXT NOT NULL REFERENCES scim_groups (id) ON DELETE CASCADE, scim_user_id TEXT NOT NULL REFERENCES scim_users (id) ON DELETE CASCADE, membership_key TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL);
CREATE INDEX scim_connection_bindings_connection_id_idx ON scim_connection_bindings (connection_id);
CREATE INDEX scim_identity_tombstones_connection_id_idx ON scim_identity_tombstones (connection_id);
CREATE INDEX scim_identity_tombstones_provisioning_domain_id_idx ON scim_identity_tombstones (provisioning_domain_id);
CREATE INDEX scim_identity_tombstones_user_id_idx ON scim_identity_tombstones (user_id);
CREATE INDEX scim_subjects_profile_source_id_idx ON scim_subjects (profile_source_id);
CREATE INDEX scim_users_connection_id_idx ON scim_users (connection_id);
CREATE INDEX scim_users_provisioning_domain_id_idx ON scim_users (provisioning_domain_id);
CREATE INDEX scim_users_user_id_idx ON scim_users (user_id);
CREATE INDEX scim_projection_grants_connection_id_idx ON scim_projection_grants (connection_id);
CREATE INDEX scim_projection_grants_provisioning_domain_id_idx ON scim_projection_grants (provisioning_domain_id);
CREATE INDEX scim_projection_grants_scim_user_id_idx ON scim_projection_grants (scim_user_id);
CREATE INDEX scim_projection_grants_user_id_idx ON scim_projection_grants (user_id);
CREATE INDEX scim_groups_connection_id_idx ON scim_groups (connection_id);
CREATE INDEX scim_groups_provisioning_domain_id_idx ON scim_groups (provisioning_domain_id);
CREATE INDEX scim_group_members_connection_id_idx ON scim_group_members (connection_id);
CREATE INDEX scim_group_members_group_id_idx ON scim_group_members (group_id);
CREATE INDEX scim_group_members_scim_user_id_idx ON scim_group_members (scim_user_id);
`;
