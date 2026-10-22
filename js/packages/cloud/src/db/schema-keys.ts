// Browser keys: the sites (origins) whose pages may send with the key, as a JSON list. Null for ingest and read keys.
export const BROWSER_KEYS_MIGRATION = `
ALTER TABLE api_keys ADD COLUMN origins TEXT;
`;
