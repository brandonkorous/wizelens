import type { ServerResponse } from "node:http";
import { activeTags, expandQuery, searchMemory, searchRequestOf, suggestMemory, suggestRequestOf, suggestTags, type TagRule } from "@wizeworks/lens-core";
import { sendJson } from "./http-util.js";
import type { TraceStore } from "./store.js";

// The in-app search API (docs/SEARCH-PLAN.md), over this service's own traces in memory. `env` is the service's environment.

/** `GET api/search?q=&kind=&range=&limit=&cursor=`. A bad search answers 400 with the error's position; `tag:` reads the `tags` option. */
export function sendSearch(store: TraceStore, tags: readonly TagRule[], p: URLSearchParams, res: ServerResponse, env?: string): void {
  const r = searchRequestOf(p, Date.now(), store.maxAgeMs);
  if (!r.ok) return sendJson(res, 400, r);
  const t0 = performance.now();
  const { query, unknownTags } = expandQuery({ ...r.query, env }, activeTags(tags));
  const page = searchMemory(store.all(), query);
  sendJson(res, 200, { ...page, tookMs: Math.round(performance.now() - t0), settling: null, unknownTags });
}

/** `GET api/search/suggest?field=&prefix=&range=&limit=`. */
export function sendSuggest(store: TraceStore, tags: readonly TagRule[], p: URLSearchParams, res: ServerResponse, env?: string): void {
  const r = suggestRequestOf(p, Date.now(), store.maxAgeMs);
  if (!r.ok) return sendJson(res, 400, r);
  sendJson(res, 200, { items: suggestTags(r.request, tags) ?? suggestMemory(store.all(), { ...r.request, env }) });
}
