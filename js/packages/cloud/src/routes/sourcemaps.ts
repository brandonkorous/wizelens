import { answerResolve, checkUpload, MAX_SOURCEMAP_BYTES, normalizeRelease, parseSourceMap, resolveTargetOf, SOURCEMAPS_RESOLVE_PATH } from "@wizeworks/lens-core/internal";
import { readBody } from "@wizeworks/lens-hub/internal";
import type { Ctx } from "../app.js";
import { joinScope } from "../auth/join-scope.js";
import { tenantScope } from "../telemetry/store.js";
import type { ProjectAccess } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { RateLimiter } from "../http/limiter.js";
import type { Router } from "../http/router.js";
import { listSourceMaps, saveSourceMap } from "../repo/sourcemaps.js";
import { projectOf } from "./data.js";
import { ingestProject } from "./ingest.js";
import { type ReadScope, readScopeOf } from "./scope.js";

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

/** The project whose maps a resolve call reads: the one the error's span was sent to, among those the caller may read; else `?project=` (or the first of all). */
async function mapsProject(ctx: Ctx, r: ReadScope, body: unknown): Promise<string> {
  const fallback = r.project?.id ?? r.projects[0]!.id;
  const target = resolveTargetOf(body);
  if (!target?.spanId) return fallback;
  const scope = r.access ? await joinScope(ctx.app.db, r.access) : r.scope;
  for (const id of scope.projects) {
    const part = await ctx.app.telemetry.trace(tenantScope(scope.org, [id]), target.traceId);
    if (part?.spans.some((s) => s.spanId === target.spanId)) return id;
  }
  return fallback;
}

/** `POST api/sourcemaps/resolve?project=` from the dashboard: a browser stack after the uploaded maps of the error's project. */
async function resolve(ctx: Ctx): Promise<void> {
  const r = await readScopeOf(ctx);
  const body = await readJsonBody(ctx.req);
  const answer = await answerResolve(body, ctx.app.maps(await mapsProject(ctx, r, body)));
  sendJson(ctx.res, answer.status, answer.body);
}

export function sourceMapRoutes(r: Router<Ctx>): void {
  r.on("POST", SOURCEMAPS_RESOLVE_PATH, resolve);
}
