// Browser keys: the sites (origins) whose pages may send with the key, as a JSON list. Null for ingest and read keys.
export const BROWSER_KEYS_MIGRATION = `
ALTER TABLE api_keys ADD COLUMN origins TEXT;
`;

// A secret key seen in a page: the audit lines that say so, found per organization without reading every MCP call.
export const KEY_EXPOSED_MIGRATION = `
CREATE INDEX ix_audit_key_exposed ON audit (org_id, time_ms) WHERE action = 'key.exposed';
`;
