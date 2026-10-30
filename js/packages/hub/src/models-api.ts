import type { ServerResponse } from "node:http";
import { alignNow, APDEX_PAGES, ISSUE_PAGES, isPageName, isTimeRange, type ModelOf, type PageName, pageContext, runPage, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core/internal";
import { sendJson } from "@wizeworks/lens-node/internal";
import type { ApiContext } from "./api.js";
import type { HubData } from "./data.js";
import { issueStates, issuesVersion } from "./issues.js";
import { apdexTargets, apdexVersion } from "./slos.js";
import { listSearch } from "./list-search.js";
import { factsOf, keepMsOf } from "./settings.js";
import { hubExecutor, hubSettling } from "./scale-exec.js";
import { packageRisks } from "./packages/check.js";
import { packagesVersion } from "./packages/loop.js";
import { sqlitePackages } from "./packages/sqlite.js";

/** The Security page's package risks and scan, for one project. */
async function packageContext(db: Parameters<typeof sqlitePackages>[0], project: string) {
  const { risks, scan } = await packageRisks(sqlitePackages(db), project);
  return { packages: risks, packageScan: scan };
}

const CACHE_MAX = 200;
/** A custom window may start this much before the kept age (snapping, clock skew). */
const WINDOW_SLACK_MS = 15 * 60_000;
const RESERVED = new Set(["project", "range", "env"]);
const cache = new Map<string, unknown>();

/** A range or window the hub does not keep: a 400 for the API, a tool error for MCP. */
export class PageRangeError extends Error {}

/** Model parameters: every query value except the ones that pick the data. */
const paramsOf = (p: URLSearchParams): Record<string, string> => Object.fromEntries([...p].filter(([k]) => !RESERVED.has(k)).map(([k, v]): [string, string] => [k, v.slice(0, 500)]).sort());

function remember(key: string, value: unknown): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

/** One page's numbers for a project and environment, from the hub's stats tables. Cached until stats change. */
export async function hubPage<P extends PageName>(data: HubData, page: P, range: TimeRange, scope: { project?: string; env?: string }, params: Record<string, string>): Promise<ModelOf<P>> {
  const store = data.store;
  const keepMs = keepMsOf(store, scope.project ?? "");
  if (TIME_RANGES[range].ms > keepMs) throw new PageRangeError("This range is longer than the hub keeps data.");
  const now = alignNow(store.now());
  // Stats only change when traces settle or leave, so the settle counter keys the cache.
  const slowQueryMs = factsOf(store, scope.project ?? "").slowQueryMs!;
  const key = JSON.stringify([page, range, scope, params, now, store.settleGen, issuesVersion(), apdexVersion(), packagesVersion(), slowQueryMs, keepMs]);
  if (cache.has(key)) return cache.get(key) as ModelOf<P>;
  const ctx = pageContext(range, now, params, { slowQueryMs, scope: scope.project ?? "" }, hubSettling(store, scope));
  if (ctx.custom && now - ctx.window.from > keepMs + WINDOW_SLACK_MS) throw new PageRangeError("This time window starts before the hub keeps data.");
  const issues = ISSUE_PAGES.has(page) ? { issues: issueStates(store.db, scope.project ?? "") } : {};
  const apdex = APDEX_PAGES.has(page) ? { apdex: apdexTargets(store.db, scope.project ?? "") } : {};
  const search = await listSearch(store, page, params, ctx.window, scope);
  const packages = page === "security" ? await packageContext(store.db, scope.project ?? "") : {};
  const value = await runPage(page, { ...ctx, ...issues, ...apdex, ...search, ...packages }, hubExecutor(store, scope, data.keepRemote));
  remember(key, value);
  return value;
}

/** `GET api/models/<page>?range=&project=&env=&...`: one page's numbers. */
export async function sendPageModel(c: ApiContext, page: string, p: URLSearchParams, res: ServerResponse): Promise<void> {
  if (!isPageName(page)) return sendJson(res, 404, { error: `No model named "${page}".` });
  const range = p.get("range") ?? "24h";
  if (!isTimeRange(range)) return sendJson(res, 400, { error: `Unknown range "${range}".` });
  const scope = { project: p.get("project") || undefined, env: p.get("env") || undefined };
  try {
    sendJson(res, 200, await hubPage(c.data, page, range, scope, paramsOf(p)));
  } catch (err) {
    if (err instanceof PageRangeError) return sendJson(res, 400, { error: err.message });
    throw err;
  }
}
