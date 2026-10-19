// Migration 14: browser source maps per project, release, and generated file, kept gzipped (docs/CONTRACT.md, "Source maps").
export const SOURCEMAPS_MIGRATION = `
CREATE TABLE sourcemaps (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, release TEXT NOT NULL, file TEXT NOT NULL,
  map BYTEA NOT NULL, bytes INTEGER NOT NULL, uploaded_ms DOUBLE PRECISION NOT NULL, PRIMARY KEY (project_id, release, file)
);
CREATE INDEX sourcemaps_uploaded_idx ON sourcemaps (project_id, uploaded_ms);
`;
