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

/** Migration 25: an item may belong to the whole organization (saved under "All projects"), with no project. */
export const SAVED_ORG_MIGRATION = `
ALTER TABLE saved_items ADD COLUMN org_id TEXT REFERENCES orgs (id) ON DELETE CASCADE;
UPDATE saved_items s SET org_id = p.org_id FROM projects p WHERE p.id = s.project_id;
ALTER TABLE saved_items ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE saved_items ALTER COLUMN project_id DROP NOT NULL;
CREATE INDEX ix_saved_items_org ON saved_items (org_id);
`;

/** Who a shared link is for, as its maker wrote it, so a list of links can be told apart. */
export const SHARE_NOTE_MIGRATION = `ALTER TABLE shares ADD COLUMN note TEXT NOT NULL DEFAULT '';`;
