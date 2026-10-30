import { activeTags, expandQuery, searchRequestOf, SETTLE_BEHIND_MS, suggestRequestOf, suggestTags } from "@wizeworks/lens-core/internal";
import type { Ctx } from "../app.js";
import { sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { readScopeOf, scopeRetentionMs } from "./scope.js";
import { scopeTags } from "./scope-state.js";

// The search API (docs/SEARCH-PLAN.md) for one project the caller may read, or all of an organization's, within their retention.
async function sourceOf(ctx: Ctx) {
  const r = await readScopeOf(ctx);
  return { scope: r.scope, maxMs: await scopeRetentionMs(ctx.app, r.projects), tags: await scopeTags(ctx.app, r.projects) };
}

/** `GET api/search?project=&q=&kind=&range=&env=&limit=&cursor=`. A bad search answers 400 with the error's position; `tag:` reads the project's tags. */
async function search(ctx: Ctx): Promise<void> {
  const { scope, maxMs, tags } = await sourceOf(ctx);
  const r = searchRequestOf(ctx.url.searchParams, ctx.app.config.now(), maxMs);
  if (!r.ok) return sendJson(ctx.res, 400, r);
  const t0 = performance.now();
  const { query, unknownTags } = expandQuery(r.query, activeTags(tags));
  const page = await ctx.app.telemetry.search(scope, query);
  const settling = await ctx.app.telemetry.settling(scope, { env: r.query.env, before: ctx.app.config.now() - SETTLE_BEHIND_MS });
  sendJson(ctx.res, 200, { ...page, tookMs: Math.round(performance.now() - t0), settling, unknownTags });
}

/** `GET api/search/suggest?project=&field=&prefix=&range=&limit=`. */
async function suggest(ctx: Ctx): Promise<void> {
  const { scope, maxMs, tags } = await sourceOf(ctx);
  const r = suggestRequestOf(ctx.url.searchParams, ctx.app.config.now(), maxMs);
  if (!r.ok) return sendJson(ctx.res, 400, r);
  sendJson(ctx.res, 200, { items: suggestTags(r.request, tags) ?? (await ctx.app.telemetry.suggest(scope, r.request)) });
}

export function searchRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/search", search);
  r.on("GET", "api/search/suggest", suggest);
}
