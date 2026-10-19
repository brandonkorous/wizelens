import type { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  cachedLoader,
  type MapLoader,
  mapFileCandidates,
  MAX_SOURCEMAP_BYTES,
  parseSourceMap,
  SOURCEMAP_RELEASES_KEPT,
  type SourceMapEntry,
} from "@wizeworks/lens-core";

// Uploaded source maps, per project ("" without one), release, and generated file. Maps are kept gzipped.
export const SOURCEMAPS_SCHEMA = `
CREATE TABLE IF NOT EXISTS sourcemaps (
  project TEXT NOT NULL, release TEXT NOT NULL, file TEXT NOT NULL, map BLOB NOT NULL, bytes INTEGER NOT NULL,
  uploaded_ms REAL NOT NULL, PRIMARY KEY (project, release, file)
);
CREATE INDEX IF NOT EXISTS ix_sourcemaps_release ON sourcemaps(project, uploaded_ms);
`;

/** Save one map (replacing the same release and file), then drop the oldest releases past the kept count. */
export function saveSourceMap(db: DatabaseSync, project: string, release: string, file: string, map: string, now: number): void {
  db.prepare("INSERT OR REPLACE INTO sourcemaps (project, release, file, map, bytes, uploaded_ms) VALUES (?, ?, ?, ?, ?, ?)").run(
    project,
    release,
    file,
    gzipSync(map),
    Buffer.byteLength(map),
    now,
  );
  db.prepare(
    `DELETE FROM sourcemaps WHERE project = ? AND release NOT IN (
      SELECT release FROM sourcemaps WHERE project = ? GROUP BY release ORDER BY max(uploaded_ms) DESC, max(rowid) DESC LIMIT ?)`,
  ).run(project, project, SOURCEMAP_RELEASES_KEPT);
}

/** The maps of a project, newest first; only one release when given. */
export function listSourceMaps(db: DatabaseSync, project: string, release?: string): SourceMapEntry[] {
  const sql = `SELECT release, file, bytes, uploaded_ms AS uploadedMs FROM sourcemaps WHERE project = ?${release ? " AND release = ?" : ""} ORDER BY uploaded_ms DESC LIMIT 1000`;
  return db.prepare(sql).all(...(release ? [project, release] : [project])) as unknown as SourceMapEntry[];
}

function readMap(db: DatabaseSync, project: string, release: string, url: string): string | null {
  const files = mapFileCandidates(url);
  if (files.length === 0) return null;
  const sql = `SELECT map FROM sourcemaps WHERE project IN (?, '') AND release = ? AND file IN (${files.map(() => "?").join(", ")})
    ORDER BY project DESC, length(file) DESC LIMIT 1`;
  const row = db.prepare(sql).get(project, release, ...files) as { map: Uint8Array } | undefined;
  return row ? gunzipSync(row.map, { maxOutputLength: MAX_SOURCEMAP_BYTES }).toString("utf8") : null;
}

/** Uploaded maps for one project (and maps uploaded with no project). Needs the release the browser sent. */
export function uploadedMapLoader(db: DatabaseSync, project: string): MapLoader {
  const load: MapLoader = async (url, release) => {
    if (!release) return null;
    const text = readMap(db, project, release, url);
    return text ? parseSourceMap(text) : null;
  };
  return cachedLoader(load, { max: 20, missMs: 5000 });
}
