import { activeTags, alignNow, APDEX_PAGES, hostsModelOf, INFRA_PARAMS, ISSUE_PAGES, isPageName, isStructuredSearch, isTimeRange, kubeModelOf, LIST_SEARCH_KIND, type ModelOf, type PageName, pageContext, runPage, type SearchQuery, searchTraceIds, SETTLE_BEHIND_MS, TIME_RANGES, type TimeRange, type TimeWindow } from "@wizeworks/lens-core/internal";
import type { CloudApp, Ctx } from "../app.js";
import { fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { listServices } from "../repo/trace-read.js";
import { metricParamsOf, metricRange, projectMetrics } from "./metrics.js";
import { projectScope, type TenantScope } from "../telemetry/store.js";
import { type ProjectRef, type ReadScope, readScopeOf, scopeFacts, scopeRetentionMs } from "./scope.js";
import { scopeApdex, scopeIssues, scopePackages, scopeTags } from "./scope-state.js";

const CACHE_MS = 15_000;
const CACHE_MAX = 500;
const DAY_MS = 86_400_000;
const RESERVED = new Set(["project", "org", "range", "env"]);
const cache = new Map<string, { atMs: number; value: unknown; projects: readonly string[] }>();

function cached(key: string, now: number): unknown {
  const hit = cache.get(key);
  return hit && now - hit.atMs < CACHE_MS ? hit.value : undefined;
}

function remember(key: string, value: unknown, now: number, projects: readonly string[]): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { atMs: now, value, projects });
}

/** Drop the cached pages of every read with this project when it gets new data, so the dashboard's reload sees it. */
export function forgetModels(projectId: string): void {
  for (const [key, hit] of cache) if (hit.projects.includes(projectId)) cache.delete(key);
}

/** Model parameters: every query value except the ones that pick the data. */
const paramsOf = (url: URL): Record<string, string> => Object.fromEntries([...url.searchParams].filter(([k]) => !RESERVED.has(k)).sort());

/** The projects a page reads, and its telemetry scope. */
export interface PageScope {
  projects: readonly ProjectRef[];
  scope: TenantScope;
}

/** One page's numbers for one project (alerts, MCP, shares). */
export const projectPage = <P extends PageName>(app: CloudApp, project: { id: string; orgId: string }, page: P, range: TimeRange, params: Record<string, string> = {}, env?: string) =>
  scopePage(app, { projects: [project], scope: projectScope(project) }, page, range, params, env);

/** What a page reads besides telemetry: issue states, Apdex targets, and trace ids of a structured search. */
async function pageExtras(app: CloudApp, r: PageScope, page: PageName, params: Record<string, string>, w: TimeWindow, env?: string) {
  const issues = ISSUE_PAGES.has(page) ? { issues: await scopeIssues(app, r.projects) } : {};
  const apdex = APDEX_PAGES.has(page) ? { apdex: await scopeApdex(app, r.projects) } : {};
  const kind = LIST_SEARCH_KIND[page];
  const run = (q: SearchQuery) => app.telemetry.search(r.scope, q);
  const search = kind && isStructuredSearch(params.q) ? { searchIds: await searchTraceIds(run, kind, params.q!, w, env, activeTags(await scopeTags(app, r.projects))) } : {};
  const packages = page === "security" ? await scopePackages(app, r.projects) : {};
  return { ...issues, ...apdex, ...search, ...packages };
}

/** One page's numbers for the projects of a read, from their stats tables. Cached for 15 seconds, like the dashboard's. */
export async function scopePage<P extends PageName>(app: CloudApp, r: PageScope, page: P, range: TimeRange, params: Record<string, string> = {}, env?: string): Promise<ModelOf<P>> {
  const keepMs = await scopeRetentionMs(app, r.projects);
  if (TIME_RANGES[range].ms > keepMs) fail(400, "This range is longer than these projects keep data.");
  const now = alignNow(app.config.now());
  const { slowQueryMs } = await scopeFacts(app, r.projects);
  const ids = [...r.scope.projects].sort();
  const key = JSON.stringify([ids, page, range, env, params, now, slowQueryMs]);
  const hit = cached(key, app.config.now());
  if (hit) return hit as ModelOf<P>;
  const t = app.telemetry;
  const pc = pageContext(range, now, params, { slowQueryMs, scope: ids.join(",") }, await t.settling(r.scope, { env, before: app.config.now() - SETTLE_BEHIND_MS }));
  // Only a custom window (`from`, `to`) can start before what is kept; a named range snaps into a bucket that is still kept.
  if (pc.custom && now - pc.window.from > keepMs + 15 * 60_000) fail(400, "This time window starts before these projects keep data.");
  const value = await runPage(page, { ...pc, ...(await pageExtras(app, r, page, params, pc.window, env)) }, t.executor(r.scope, keepMs, env));
  remember(key, value, app.config.now(), ids);
  return value;
}

/** `GET api/models/metrics?project=&range=&env=&metric=&service=&group=&stat=&q=`: the metrics page, from the newest points. */
async function metrics(ctx: Ctx, r: ReadScope): Promise<void> {
  const range = metricRange(ctx, (await scopeRetentionMs(ctx.app, r.projects)) / DAY_MS);
  const now = alignNow(ctx.app.config.now());
  const env = ctx.url.searchParams.get("env") || undefined;
  const params = metricParamsOf(ctx.url.searchParams);
  const ids = [...r.scope.projects].sort();
  const key = JSON.stringify([ids, "metrics", range, env, params, now]);
  const hit = cached(key, ctx.app.config.now());
  if (hit) return sendJson(ctx.res, 200, hit);
  const value = await projectMetrics(ctx.app.telemetry, r.scope, range, params, { now, env });
  remember(key, value, ctx.app.config.now(), ids);
  sendJson(ctx.res, 200, value);
}

/** `GET api/models/hosts` and `api/models/kubernetes`: host and Kubernetes metrics with the services on them. */
async function infra(ctx: Ctx, r: ReadScope, page: "hosts" | "kubernetes"): Promise<void> {
  const range = metricRange(ctx, (await scopeRetentionMs(ctx.app, r.projects)) / DAY_MS);
  const now = alignNow(ctx.app.config.now());
  const env = ctx.url.searchParams.get("env") || undefined;
  const params = Object.fromEntries(INFRA_PARAMS.flatMap((k) => (ctx.url.searchParams.get(k) ? [[k, ctx.url.searchParams.get(k)!.slice(0, 300)]] : [])));
  const ids = [...r.scope.projects].sort();
  const key = JSON.stringify([ids, page, range, env, params, now]);
  const hit = cached(key, ctx.app.config.now());
  if (hit) return sendJson(ctx.res, 200, hit);
  const data = await ctx.app.telemetry.infraData({ scope: r.scope, env }, range, params, now);
  const lists = await Promise.all(r.projects.map((p) => listServices(ctx.app.db, p.id, ctx.app.config.now())));
  const registry = lists.flat().filter((s) => !env || (s.environment ?? "") === env);
  const value = page === "hosts" ? hostsModelOf(data, registry) : kubeModelOf(data, registry);
  remember(key, value, ctx.app.config.now(), ids);
  sendJson(ctx.res, 200, value);
}

/** `GET api/models/<page>?project=&range=&env=&...`: one page's numbers, from the stats tables of one project or all of an organization's. */
async function model(ctx: Ctx): Promise<void> {
  const page = ctx.params.page!;
  if (page !== "metrics" && page !== "hosts" && page !== "kubernetes" && !isPageName(page)) return fail(404, `No model named "${page}".`);
  const r = await readScopeOf(ctx);
  if (page === "metrics") return metrics(ctx, r);
  if (page === "hosts" || page === "kubernetes") return infra(ctx, r, page);
  const range = ctx.url.searchParams.get("range") ?? "24h";
  if (!isTimeRange(range)) return fail(400, `Unknown range "${range}".`);
  const env = ctx.url.searchParams.get("env") || undefined;
  sendJson(ctx.res, 200, await scopePage(ctx.app, r, page, range, paramsOf(ctx.url), env));
}

export function modelRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/models/:page", model);
}
