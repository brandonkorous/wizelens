import { answerResolve, checkUpload, MAX_SOURCEMAP_BYTES, normalizeRelease, parseSourceMap, SOURCEMAPS_RESOLVE_PATH } from "@wizeworks/lens-core";
import { readBody } from "@wizeworks/lens-hub/kit";
import type { Ctx } from "../app.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { RateLimiter } from "../http/limiter.js";
import type { Router } from "../http/router.js";
import { listSourceMaps, saveSourceMap } from "../repo/sourcemaps.js";
import { projectOf } from "./data.js";
import { ingestProject } from "./ingest.js";

/** `POST api/sourcemaps?release=&file=` with an ingest key: one map for the key's project (body the map JSON, gzip allowed). */
export async function uploadSourceMap(ctx: Ctx, limiter: RateLimiter): Promise<void> {
  const projectId = await ingestProject(ctx, limiter);
  const q = checkUpload(ctx.url.searchParams);
  if (typeof q === "string") return fail(400, q);
  let text: string;
  try {
    text = (await readBody(ctx.req, MAX_SOURCEMAP_BYTES)).toString("utf8");
  } catch {
    return fail(413, "The map is too large (64 MB at most).");
  }
  if (!parseSourceMap(text)) return fail(400, "The body is not a source map (version 3).");
  await saveSourceMap(ctx.app.db, projectId, q.release, q.file, text, ctx.app.config.now());
  sendJson(ctx.res, 201, { release: q.release, file: q.file, bytes: Buffer.byteLength(text) });
}

/** `GET api/sourcemaps[?release=]` with an ingest key: the project's maps, newest first. */
export async function listProjectMaps(ctx: Ctx, limiter: RateLimiter): Promise<void> {
  const projectId = await ingestProject(ctx, limiter);
  const release = normalizeRelease(ctx.url.searchParams.get("release")) ?? undefined;
  sendJson(ctx.res, 200, { maps: await listSourceMaps(ctx.app.db, projectId, release) });
}

/** `POST api/sourcemaps/resolve?project=` from the dashboard: a browser stack after the project's uploaded maps. */
async function resolve(ctx: Ctx): Promise<void> {
  const { project } = await projectOf(ctx);
  const answer = await answerResolve(await readJsonBody(ctx.req), ctx.app.maps(project.id));
  sendJson(ctx.res, answer.status, answer.body);
}

export function sourceMapRoutes(r: Router<Ctx>): void {
  r.on("POST", SOURCEMAPS_RESOLVE_PATH, resolve);
}
