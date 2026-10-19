import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { answerResolve, checkUpload, type MapLoader, MAX_SOURCEMAP_BYTES, normalizeRelease, parseSourceMap } from "@wizeworks/lens-core";
import { localMapLoader, sendJson, type SourceMapOptions } from "@wizeworks/lens-node/kit";
import { parseJson, readBody } from "./body.js";
import { listSourceMaps, saveSourceMap, uploadedMapLoader } from "./sourcemaps.js";

/** The map loader for one project: its uploads first, then build folders and dev servers. */
export type HubMaps = (project: string) => MapLoader;

/** One loader per project, made on first use. */
export function hubMaps(db: DatabaseSync, options: SourceMapOptions | false | undefined): HubMaps {
  const byProject = new Map<string, MapLoader>();
  return (project) => {
    let load = byProject.get(project);
    if (!load) byProject.set(project, (load = localMapLoader(options, [uploadedMapLoader(db, project)]) ?? uploadedMapLoader(db, project)));
    return load;
  };
}

const projectOf = (url: URL) => url.searchParams.get("project")?.slice(0, 100) ?? "";

/** `POST api/sourcemaps?release=&file=[&project=]`: one map, body the map JSON (gzip allowed). */
export async function uploadSourceMap(db: DatabaseSync, now: number, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = checkUpload(url.searchParams);
  if (typeof q === "string") return sendJson(res, 400, { error: q });
  let text: string;
  try {
    text = (await readBody(req, MAX_SOURCEMAP_BYTES)).toString("utf8");
  } catch {
    return sendJson(res, 413, { error: "The map is too large (64 MB at most)." });
  }
  if (!parseSourceMap(text)) return sendJson(res, 400, { error: "The body is not a source map (version 3)." });
  saveSourceMap(db, projectOf(url), q.release, q.file, text, now);
  sendJson(res, 201, { release: q.release, file: q.file, bytes: Buffer.byteLength(text) });
}

/** `GET api/sourcemaps[?release=&project=]`: the stored maps, newest first. */
export function listMaps(db: DatabaseSync, res: ServerResponse, url: URL): void {
  sendJson(res, 200, { maps: listSourceMaps(db, projectOf(url), normalizeRelease(url.searchParams.get("release")) ?? undefined) });
}

/** `POST api/sourcemaps/resolve[?project=]` with `{stack, release}`. */
export async function resolveMaps(maps: HubMaps, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  let body: unknown;
  try {
    body = parseJson(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: "invalid body" });
  }
  const answer = await answerResolve(body, maps(projectOf(url)));
  sendJson(res, answer.status, answer.body);
}
