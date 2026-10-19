import { searchRequestOf, SETTLE_BEHIND_MS, suggestRequestOf } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { projectRetentionMs } from "../scale-exec.js";
import { projectOf } from "./data.js";

// The search API (docs/SEARCH-PLAN.md) for one project the caller may read, within the organization's retention.
async function sourceOf(ctx: Ctx) {
  const { project } = await projectOf(ctx);
  const maxMs = await projectRetentionMs(ctx.app.db, project.id, ctx.app.config.retentionDays);
  return { projectId: project.id, maxMs };
}

/** `GET api/search?project=&q=&kind=&range=&env=&limit=&cursor=`. A bad search answers 400 with the error's position. */
async function search(ctx: Ctx): Promise<void> {
  const { projectId, maxMs } = await sourceOf(ctx);
  const r = searchRequestOf(ctx.url.searchParams, ctx.app.config.now(), maxMs);
  if (!r.ok) return sendJson(ctx.res, 400, r);
  const t0 = performance.now();
  const page = await ctx.app.telemetry.search(projectId, r.query);
  sendJson(ctx.res, 200, { ...page, tookMs: Math.round(performance.now() - t0), settling: await ctx.app.telemetry.settling(projectId, { env: r.query.env, before: ctx.app.config.now() - SETTLE_BEHIND_MS }) });
}

/** `GET api/search/suggest?project=&field=&prefix=&range=&limit=`. */
async function suggest(ctx: Ctx): Promise<void> {
  const { projectId, maxMs } = await sourceOf(ctx);
  const r = suggestRequestOf(ctx.url.searchParams, ctx.app.config.now(), maxMs);
  if (!r.ok) return sendJson(ctx.res, 400, r);
  sendJson(ctx.res, 200, { items: await ctx.app.telemetry.suggest(projectId, r.request) });
}

export function searchRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/search", search);
  r.on("GET", "api/search/suggest", suggest);
}
