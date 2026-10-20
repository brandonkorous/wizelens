import type { ServerResponse } from "node:http";
import { alignNow, APDEX_PAGES, ISSUE_PAGES, isPageName, isTimeRange, pageContext, runPage, TIME_RANGES } from "@wizeworks/lens-core";
import { sendJson } from "@wizeworks/lens-node/kit";
import type { ApiContext } from "./api.js";
import { issueStates, issuesVersion } from "./issues.js";
import { apdexTargets, apdexVersion } from "./slos.js";
import { listSearch } from "./list-search.js";
import { factsOf, keepMsOf } from "./settings.js";
import { hubExecutor, hubSettling } from "./scale-exec.js";

const CACHE_MAX = 200;
/** A custom window may start this much before the kept age (snapping, clock skew). */
const WINDOW_SLACK_MS = 15 * 60_000;
const RESERVED = new Set(["project", "range", "env"]);
const cache = new Map<string, unknown>();

/** Model parameters: every query value except the ones that pick the data. */
const paramsOf = (p: URLSearchParams): Record<string, string> => Object.fromEntries([...p].filter(([k]) => !RESERVED.has(k)).map(([k, v]): [string, string] => [k, v.slice(0, 500)]).sort());

function remember(key: string, value: unknown): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

/** `GET api/models/<page>?range=&project=&env=&...`: one page's numbers, from the hub's stats tables. */
export async function sendPageModel(c: ApiContext, page: string, p: URLSearchParams, res: ServerResponse): Promise<void> {
  if (!isPageName(page)) return sendJson(res, 404, { error: `No model named "${page}".` });
  const range = p.get("range") ?? "24h";
  if (!isTimeRange(range)) return sendJson(res, 400, { error: `Unknown range "${range}".` });
  const store = c.data.store;
  const scope = { project: p.get("project") || undefined, env: p.get("env") || undefined };
  const keepMs = keepMsOf(store, scope.project ?? "");
  if (TIME_RANGES[range].ms > keepMs) return sendJson(res, 400, { error: "This range is longer than the hub keeps data." });
  const params = paramsOf(p);
  const now = alignNow(c.o.now());
  // Stats only change when traces settle or leave, so the settle counter keys the cache.
  const slowQueryMs = factsOf(store, scope.project ?? "").slowQueryMs!;
  const key = JSON.stringify([page, range, scope, params, now, store.settleGen, issuesVersion(), apdexVersion(), slowQueryMs, keepMs]);
  if (cache.has(key)) return sendJson(res, 200, cache.get(key));
  const ctx = pageContext(range, now, params, { slowQueryMs }, hubSettling(store, scope));
  if (now - ctx.window.from > keepMs + WINDOW_SLACK_MS) return sendJson(res, 400, { error: "This time window starts before the hub keeps data." });
  const issues = ISSUE_PAGES.has(page) ? { issues: issueStates(store.db, scope.project ?? "") } : {};
  const apdex = APDEX_PAGES.has(page) ? { apdex: apdexTargets(store.db, scope.project ?? "") } : {};
  const search = await listSearch(store, page, params, ctx.window, scope);
  const value = await runPage(page, { ...ctx, ...issues, ...apdex, ...search }, hubExecutor(store, scope, c.data.keepRemote));
  remember(key, value);
  sendJson(res, 200, value);
}
