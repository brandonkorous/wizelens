import type { ServerResponse } from "node:http";
import { activeTags, expandQuery, searchRequestOf, searchSql, SQLITE_DIALECT, suggestRequestOf, suggestSql, suggestTags } from "@wizeworks/lens-core/internal";
import { sendJson } from "@wizeworks/lens-node/internal";
import type { ApiContext } from "./api.js";
import { hubSettling, sqliteRunner, sqlScopeOf } from "./scale-exec.js";
import { hubTags } from "./tags.js";

// The hub's search API (docs/SEARCH-PLAN.md): one page of results, and autocomplete. `project` narrows both.
const sourceOf = (c: ApiContext, p: URLSearchParams) => ({ d: SQLITE_DIALECT, run: sqliteRunner(c.data.store.db), scope: sqlScopeOf({ project: p.get("project") || undefined }) });

/** `GET api/search?q=&kind=&range=&env=&project=&limit=&cursor=`. A bad search answers 400 with the error's position; `tag:` reads the hub's tags. */
export async function sendSearch(c: ApiContext, p: URLSearchParams, res: ServerResponse): Promise<void> {
  const r = searchRequestOf(p, c.o.now(), c.data.store.maxAgeMs);
  if (!r.ok) return sendJson(res, 400, r);
  const t0 = performance.now();
  const src = sourceOf(c, p);
  const { query, unknownTags } = expandQuery(r.query, activeTags(hubTags(c.data.store.db)));
  const page = await searchSql(src, query);
  sendJson(res, 200, { ...page, tookMs: Math.round(performance.now() - t0), settling: hubSettling(c.data.store, src.scope), unknownTags });
}

/** `GET api/search/suggest?field=&prefix=&range=&project=&limit=`. */
export async function sendSuggest(c: ApiContext, p: URLSearchParams, res: ServerResponse): Promise<void> {
  const r = suggestRequestOf(p, c.o.now(), c.data.store.maxAgeMs);
  if (!r.ok) return sendJson(res, 400, r);
  sendJson(res, 200, { items: suggestTags(r.request, hubTags(c.data.store.db)) ?? (await suggestSql(sourceOf(c, p), r.request)) });
}
