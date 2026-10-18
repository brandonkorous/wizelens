import type { ServerResponse } from "node:http";
import { searchMemory, searchRequestOf, suggestMemory, suggestRequestOf } from "@wizeworks/lens-core";
import { sendJson } from "./http-util.js";
import type { TraceStore } from "./store.js";

// The in-app search API (docs/SEARCH-PLAN.md), over this service's own traces in memory. `env` is the service's environment.

/** `GET api/search?q=&kind=&range=&limit=&cursor=`. A bad search answers 400 with the error's position. */
export function sendSearch(store: TraceStore, p: URLSearchParams, res: ServerResponse, env?: string): void {
  const r = searchRequestOf(p, Date.now(), store.maxAgeMs);
  if (!r.ok) return sendJson(res, 400, r);
  const t0 = performance.now();
  const page = searchMemory(store.all(), { ...r.query, env });
  sendJson(res, 200, { ...page, tookMs: Math.round(performance.now() - t0), settling: null });
}

/** `GET api/search/suggest?field=&prefix=&range=&limit=`. */
export function sendSuggest(store: TraceStore, p: URLSearchParams, res: ServerResponse, env?: string): void {
  const r = suggestRequestOf(p, Date.now(), store.maxAgeMs);
  if (!r.ok) return sendJson(res, 400, r);
  sendJson(res, 200, { items: suggestMemory(store.all(), { ...r.request, env }) });
}
