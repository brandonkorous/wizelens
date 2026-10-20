import type { ServiceInfo } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { joinScope } from "../auth/join-scope.js";
import { principalOf, type ProjectAccess, requireProject } from "../auth/principal.js";
import { fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { forgetOfflineServices } from "../repo/services.js";
import { environmentsOf, listServices, type TraceQuery } from "../repo/trace-read.js";
import { factsWith } from "../repo/settings.js";
import { projectRetentionMs } from "../scale-exec.js";
import { projectScope } from "../telemetry/store.js";

const DAY_MS = 86_400_000;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (p: URLSearchParams, k: string) => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);

/** The project named by `?project=`, with access checked. */
export async function projectOf(ctx: Ctx): Promise<ProjectAccess> {
  const id = ctx.url.searchParams.get("project");
  if (!id) return fail(400, "Add ?project=<project id>.");
  return requireProject(ctx, id);
}

/** How long the asked project keeps data, and the thresholds it uses; the cloud's own when no project is asked or allowed. */
async function projectInfo(ctx: Ctx): Promise<{ maxAgeMs: number; analysis: { slowQueryMs: number; nPlusOneThreshold: number } }> {
  const c = ctx.app.config;
  const fallback = { maxAgeMs: c.retentionDays * DAY_MS, analysis: { slowQueryMs: c.slowQueryMs, nPlusOneThreshold: c.nPlusOneThreshold } };
  const id = ctx.url.searchParams.get("project");
  const p = id ? await principalOf(ctx) : undefined;
  if (!id || !p) return fallback;
  const access = await requireProject(ctx, id).catch(() => undefined);
  if (!access) return fallback;
  const facts = factsWith(c, await ctx.app.settings.get(id));
  const maxAgeMs = await projectRetentionMs(ctx.app.db, id, c.retentionDays);
  return { maxAgeMs, analysis: { slowQueryMs: facts.slowQueryMs!, nPlusOneThreshold: facts.nPlusOneThreshold! } };
}

async function info(ctx: Ctx): Promise<void> {
  const project = await projectInfo(ctx);
  const value: ServiceInfo = {
    mode: "cloud",
    capabilities: ["environments", "registry", "accounts", "alerts", "sharing", "serverStats", "metrics", "serverMetrics", "search", "changes", "issues", "infra", "uptime", "statusPages", "sourcemaps", "slos", "saved", "tags", "settings"],
    service: "WizeLens Cloud",
    version: ctx.app.version,
    runtime: `node ${process.version}`,
    mcp: true,
    startedMs: ctx.app.startedMs,
    // PGlite is Postgres in-process: both keep data across restarts.
    storage: { kind: "postgres", maxAgeMs: project.maxAgeMs },
    analysis: project.analysis,
    redactKeys: [...ctx.app.config.redactKeys],
  };
  sendJson(ctx.res, 200, value);
}

async function traces(ctx: Ctx): Promise<void> {
  const { project } = await projectOf(ctx);
  const p = ctx.url.searchParams;
  const full = p.get("full") === "true";
  const q: TraceQuery = { scope: projectScope(project), limit: clamp(num(p, "limit") ?? (full ? 1000 : 50), 1, full ? 5000 : 1000) };
  q.since = num(p, "since");
  q.before = num(p, "before");
  q.env = p.get("env") || undefined;
  q.session = p.get("session") || undefined;
  q.noLoose = !full;
  const list = await ctx.app.telemetry.traces(q);
  sendJson(ctx.res, 200, full ? list : list.map(({ spans: _s, logs: _l, remotes: _r, ...summary }) => summary));
}

// One trace, with its parts from the other projects the caller may read in the same organization (`join=false`: this project only).
async function trace(ctx: Ctx): Promise<void> {
  const access = await projectOf(ctx);
  const scope = ctx.url.searchParams.get("join") === "false" ? projectScope(access.project) : await joinScope(ctx.app.db, access);
  const t = await ctx.app.telemetry.joinedTrace(access.project.id, scope, ctx.params.id!);
  if (!t) fail(404, "Trace not found.");
  sendJson(ctx.res, 200, t);
}

async function services(ctx: Ctx): Promise<void> {
  const { project } = await projectOf(ctx);
  const db = ctx.app.db;
  sendJson(ctx.res, 200, {
    services: await listServices(db, project.id, ctx.app.config.now()),
    environments: await environmentsOf(db, project.id, await ctx.app.telemetry.traceEnvs(projectScope(project))),
    projects: [],
    ...(await ctx.app.telemetry.counts(projectScope(project))),
  });
}

/** Forget the project's offline hosts (old pods), for admins. Their traces stay. */
async function forgetOffline(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "manage");
  const now = ctx.app.config.now();
  const removed = await forgetOfflineServices(ctx.app.db, project.id, now);
  await audit(ctx.app.db, project.orgId, actor, "service.forget", { projectId: project.id, name: project.name, removed }, now);
  sendJson(ctx.res, 200, { removed });
}

export function dataRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/info", info)
    .on("GET", "api/traces", traces)
    .on("GET", "api/traces/:id", trace)
    .on("GET", "api/services", services)
    .on("POST", "api/projects/:project/services/forget", forgetOffline);
}
