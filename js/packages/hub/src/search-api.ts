import type { ServerResponse } from "node:http";
import { searchRequestOf, searchSql, SQLITE_DIALECT, suggestRequestOf, suggestSql } from "@wizeworks/lens-core";
import { sendJson } from "@wizeworks/lens-node/kit";
import type { ApiContext } from "./api.js";
import { hubSettling, sqliteRunner } from "./scale-exec.js";

// The hub's search API (docs/SEARCH-PLAN.md): one page of results, and autocomplete. `project` narrows both.
const sourceOf = (c: ApiContext, p: URLSearchParams) => ({ d: SQLITE_DIALECT, run: sqliteRunner(c.data.store.db), scope: { project: p.get("project") || undefined } });

/** `GET api/search?q=&kind=&range=&env=&project=&limit=&cursor=`. A bad search answers 400 with the error's position. */
export async function sendSearch(c: ApiContext, p: URLSearchParams, res: ServerResponse): Promise<void> {
  const r = searchRequestOf(p, c.o.now(), c.data.store.maxAgeMs);
  if (!r.ok) return sendJson(res, 400, r);
  const t0 = performance.now();
  const src = sourceOf(c, p);
  const page = await searchSql(src, r.query);
  sendJson(res, 200, { ...page, tookMs: Math.round(performance.now() - t0), settling: hubSettling(c.data.store, src.scope) });
}

/** `GET api/search/suggest?field=&prefix=&range=&project=&limit=`. */
export async function sendSuggest(c: ApiContext, p: URLSearchParams, res: ServerResponse): Promise<void> {
  const r = suggestRequestOf(p, c.o.now(), c.data.store.maxAgeMs);
  if (!r.ok) return sendJson(res, 400, r);
  sendJson(res, 200, { items: await suggestSql(sourceOf(c, p), r.request) });
}
