import { alignNow, FACT_SLOW_QUERY_MS, isPageName, isTimeRange, type ModelOf, type PageName, pageContext, runPage, SETTLE_BEHIND_MS, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import type { CloudApp, Ctx } from "../app.js";
import { fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { projectOf } from "./data.js";
import { metricParamsOf, metricRange, projectMetrics } from "./metrics.js";

const CACHE_MS = 15_000;
const CACHE_MAX = 500;
const DAY_MS = 86_400_000;
const RESERVED = new Set(["project", "range", "env"]);
const cache = new Map<string, { atMs: number; value: unknown }>();

function cached(key: string, now: number): unknown {
  const hit = cache.get(key);
  return hit && now - hit.atMs < CACHE_MS ? hit.value : undefined;
}

function remember(key: string, value: unknown, now: number): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { atMs: now, value });
}

/** Drop a project's cached pages when it gets new data, so the dashboard's reload sees it. */
export function forgetModels(projectId: string): void {
  for (const key of cache.keys()) if (key.startsWith(`["${projectId}",`)) cache.delete(key);
}

/** Model parameters: every query value except the ones that pick the data. */
const paramsOf = (url: URL): Record<string, string> => Object.fromEntries([...url.searchParams].filter(([k]) => !RESERVED.has(k)).sort());

async function retentionDays(app: CloudApp, orgId: string): Promise<number> {
  const [row] = await app.db.query<{ d: number }>("SELECT retention_days AS d FROM orgs WHERE id = $1", [orgId]);
  return row?.d ?? app.config.retentionDays;
}

/** One page's numbers for a project, from its stats tables. Cached for 15 seconds, like the dashboard's. */
export async function projectPage<P extends PageName>(app: CloudApp, project: { id: string; orgId: string }, page: P, range: TimeRange, params: Record<string, string> = {}, env?: string): Promise<ModelOf<P>> {
  const days = await retentionDays(app, project.orgId);
  if (TIME_RANGES[range].ms > days * DAY_MS) fail(400, "This range is longer than the organization keeps data.");
  const now = alignNow(app.config.now());
  const key = JSON.stringify([project.id, page, range, env, params, now]);
  const hit = cached(key, app.config.now());
  if (hit) return hit as ModelOf<P>;
  const t = app.telemetry;
  const pc = pageContext(range, now, params, { slowQueryMs: FACT_SLOW_QUERY_MS }, await t.settling(project.id, { env, before: app.config.now() - SETTLE_BEHIND_MS }));
  const value = await runPage(page, pc, t.executor(project.id, days * DAY_MS, env));
  remember(key, value, app.config.now());
  return value;
}

/** `GET api/models/metrics?project=&range=&env=&metric=&service=&group=&stat=&q=`: the metrics page, from the newest points. */
async function metrics(ctx: Ctx): Promise<void> {
  const { project } = await projectOf(ctx);
  const range = metricRange(ctx, await retentionDays(ctx.app, project.orgId));
  const now = alignNow(ctx.app.config.now());
  const env = ctx.url.searchParams.get("env") || undefined;
  const params = metricParamsOf(ctx.url.searchParams);
  const key = JSON.stringify([project.id, "metrics", range, env, params, now]);
  const hit = cached(key, ctx.app.config.now());
  if (hit) return sendJson(ctx.res, 200, hit);
  const value = await projectMetrics(ctx.app.telemetry, project.id, range, params, { now, env });
  remember(key, value, ctx.app.config.now());
  sendJson(ctx.res, 200, value);
}

/** `GET api/models/<page>?project=&range=&env=&...`: one page's numbers, from the project's stats tables. */
async function model(ctx: Ctx): Promise<void> {
  const page = ctx.params.page!;
  if (page === "metrics") return metrics(ctx);
  if (!isPageName(page)) return fail(404, `No model named "${page}".`);
  const { project } = await projectOf(ctx);
  const range = ctx.url.searchParams.get("range") ?? "24h";
  if (!isTimeRange(range)) return fail(400, `Unknown range "${range}".`);
  const env = ctx.url.searchParams.get("env") || undefined;
  sendJson(ctx.res, 200, await projectPage(ctx.app, project, page, range, paramsOf(ctx.url), env));
}

export function modelRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/models/:page", model);
}
