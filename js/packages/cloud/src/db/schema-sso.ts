// Migration 5: single sign-on providers, one organization each (Better Auth's SSO plugin; names in auth/schema-names.ts).
export const SSO_MIGRATION = `
CREATE TABLE sso_providers (
  id TEXT NOT NULL PRIMARY KEY, provider_id TEXT NOT NULL UNIQUE, issuer TEXT NOT NULL, domain TEXT NOT NULL, domain_verified BOOLEAN,
  oidc_config TEXT, saml_config TEXT, user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  org_id TEXT NOT NULL REFERENCES orgs (id) ON DELETE CASCADE
);
CREATE INDEX sso_providers_user_id_idx ON sso_providers (user_id);
CREATE INDEX sso_providers_org_id_idx ON sso_providers (org_id);
CREATE FUNCTION wl_sso_accounts_go() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM accounts WHERE provider_id = OLD.provider_id;
  RETURN NULL;
END $$;
CREATE TRIGGER sso_providers_accounts_go AFTER DELETE ON sso_providers FOR EACH ROW EXECUTE FUNCTION wl_sso_accounts_go();
`;

// "Require single sign-on": people at the provider's domain sign in only through it (auth/sso-required.ts).
export const SSO_REQUIRED_MIGRATION = `
ALTER TABLE sso_providers ADD COLUMN sso_required BOOLEAN NOT NULL DEFAULT FALSE;
`;
