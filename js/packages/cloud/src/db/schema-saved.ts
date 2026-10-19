// Saved views, searches, and dashboards per project; and share links to a page (a snapshot of its numbers), not only a trace.
export const SAVED_MIGRATION = `
CREATE TABLE saved_items (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE, owner_id TEXT NOT NULL, kind TEXT NOT NULL,
  name TEXT NOT NULL, shared BOOLEAN NOT NULL DEFAULT FALSE, body TEXT NOT NULL, created_ms DOUBLE PRECISION NOT NULL, updated_ms DOUBLE PRECISION NOT NULL
);
CREATE INDEX ix_saved_items_project ON saved_items (project_id);
ALTER TABLE shares ADD COLUMN page TEXT NOT NULL DEFAULT '';
ALTER TABLE shares ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE shares ADD COLUMN snapshot TEXT;
ALTER TABLE shares ADD COLUMN params TEXT NOT NULL DEFAULT '{}';
`;
