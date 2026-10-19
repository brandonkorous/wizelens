import { gunzipSync, gzipSync } from "node:zlib";
import { cachedLoader, type MapLoader, mapFileCandidates, MAX_SOURCEMAP_BYTES, parseSourceMap, SOURCEMAP_RELEASES_KEPT, type SourceMapEntry } from "@wizeworks/lens-core";
import type { Queryable } from "../db/db.js";

/** Save one map (replacing the same release and file), then drop the project's oldest releases past the kept count. */
export async function saveSourceMap(q: Queryable, projectId: string, release: string, file: string, map: string, now: number): Promise<void> {
  await q.query(
    `INSERT INTO sourcemaps (project_id, release, file, map, bytes, uploaded_ms) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (project_id, release, file) DO UPDATE SET map = EXCLUDED.map, bytes = EXCLUDED.bytes, uploaded_ms = EXCLUDED.uploaded_ms`,
    [projectId, release, file, gzipSync(map), Buffer.byteLength(map), now],
  );
  await q.query(
    `DELETE FROM sourcemaps WHERE project_id = $1 AND release NOT IN (
       SELECT release FROM sourcemaps WHERE project_id = $1 GROUP BY release ORDER BY max(uploaded_ms) DESC, release DESC LIMIT $2)`,
    [projectId, SOURCEMAP_RELEASES_KEPT],
  );
}

/** A project's maps, newest first; only one release when given. */
export function listSourceMaps(q: Queryable, projectId: string, release?: string): Promise<SourceMapEntry[]> {
  const sql = `SELECT release, file, bytes, uploaded_ms AS "uploadedMs" FROM sourcemaps WHERE project_id = $1${release ? " AND release = $2" : ""}
    ORDER BY uploaded_ms DESC, file LIMIT 1000`;
  return q.query<SourceMapEntry>(sql, release ? [projectId, release] : [projectId]);
}

async function readMap(q: Queryable, projectId: string, release: string, url: string): Promise<string | null> {
  const files = mapFileCandidates(url);
  if (files.length === 0) return null;
  const marks = files.map((_, i) => `$${i + 3}`).join(", ");
  const [row] = await q.query<{ map: Uint8Array }>(
    `SELECT map FROM sourcemaps WHERE project_id = $1 AND release = $2 AND file IN (${marks}) ORDER BY length(file) DESC LIMIT 1`,
    [projectId, release, ...files],
  );
  return row ? gunzipSync(row.map, { maxOutputLength: MAX_SOURCEMAP_BYTES }).toString("utf8") : null;
}

const SEP = "\n";

/** One cache of parsed maps for every project. The project rides in the release key, so projects never share a map. */
export function cloudMapLoaders(q: Queryable): (projectId: string) => MapLoader {
  const shared = cachedLoader(
    async (url, key) => {
      const [projectId, release] = (key ?? "").split(SEP);
      const text = projectId && release ? await readMap(q, projectId, release, url) : null;
      return text ? parseSourceMap(text) : null;
    },
    { max: 30, missMs: 30_000 },
  );
  return (projectId) => (url, release) => (release ? shared(url, `${projectId}${SEP}${release}`) : Promise.resolve(null));
}
