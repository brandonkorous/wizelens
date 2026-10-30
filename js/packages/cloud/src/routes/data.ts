import { PROTOCOL_VERSION, type ServiceInfo } from "@wizeworks/lens-core/internal";
import type { Ctx } from "../app.js";
import { joinScope } from "../auth/join-scope.js";
import { principalOf, type ProjectAccess, requireProject } from "../auth/principal.js";
import { fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { forgetOfflineServices } from "../repo/services.js";
import { environmentsOf, listServices, type TraceQuery } from "../repo/trace-read.js";
import { factsWith } from "../repo/settings.js";
import { projectScope, type TenantScope } from "../telemetry/store.js";
import { projectLabels, readScopeOf, scopeFacts, scopeRetentionMs } from "./scope.js";

const DAY_MS = 86_400_000;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (p: URLSearchParams, k: string) => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);

/** The project named by `?project=`, with access checked. */
export async function projectOf(ctx: Ctx): Promise<ProjectAccess> {
  const id = ctx.url.searchParams.get("project");
  if (!id) return fail(400, "Add ?project=<project id>.");
  return requireProject(ctx, id);
}

/** How long the asked projects keep data, and the thresholds they use; the cloud's own when none is asked or allowed. */
async function projectInfo(ctx: Ctx): Promise<{ maxAgeMs: number; analysis: { slowQueryMs: number; nPlusOneThreshold: number } }> {
  const c = ctx.app.config;
  const fallback = { maxAgeMs: c.retentionDays * DAY_MS, analysis: { slowQueryMs: c.slowQueryMs, nPlusOneThreshold: c.nPlusOneThreshold } };
  const p = ctx.url.searchParams.get("project") ? await principalOf(ctx) : undefined;
  if (!p) return fallback;
  const r = await readScopeOf(ctx).catch(() => undefined);
  if (!r) return fallback;
  return { maxAgeMs: await scopeRetentionMs(ctx.app, r.projects), analysis: await scopeFacts(ctx.app, r.projects) };
}

async function info(ctx: Ctx): Promise<void> {
  const project = await projectInfo(ctx);
  const value: ServiceInfo = {
    protocol: PROTOCOL_VERSION,
    mode: "cloud",
    capabilities: ["environments", "registry", "accounts", "alerts", "sharing", "serverStats", "metrics", "serverMetrics", "search", "changes", "issues", "infra", "uptime", "statusPages", "sourcemaps", "slos", "saved", "tags", "settings", ...(ctx.app.config.osv ? (["packages"] as const) : [])],
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
  const { scope } = await readScopeOf(ctx);
  const p = ctx.url.searchParams;
  const full = p.get("full") === "true";
  const q: TraceQuery = { scope, limit: clamp(num(p, "limit") ?? (full ? 1000 : 50), 1, full ? 5000 : 1000) };
  q.since = num(p, "since");
  q.before = num(p, "before");
  q.env = p.get("env") || undefined;
  q.session = p.get("session") || undefined;
  q.noLoose = !full;
  const list = await ctx.app.telemetry.traces(q);
  sendJson(ctx.res, 200, full ? list : list.map(({ spans: _s, logs: _l, remotes: _r, ...summary }) => summary));
}

// One trace, with its parts from the other projects the caller may read in the same organization (`join=false`: this project only). All projects: every part.
async function trace(ctx: Ctx): Promise<void> {
  const r = await readScopeOf(ctx);
  const t = await traceOf(ctx, r.access, r.scope, ctx.params.id!);
  if (!t) fail(404, "Trace not found.");
  sendJson(ctx.res, 200, t);
}

async function traceOf(ctx: Ctx, access: ProjectAccess | null, scope: TenantScope, id: string) {
  if (!access) return ctx.app.telemetry.trace(scope, id);
  const join = ctx.url.searchParams.get("join") === "false" ? projectScope(access.project) : await joinScope(ctx.app.db, access);
  return ctx.app.telemetry.joinedTrace(access.project.id, join, id);
}

/** Services of every project read; with many, each says its project's label. */
async function services(ctx: Ctx): Promise<void> {
  const r = await readScopeOf(ctx);
  const db = ctx.app.db;
  const labels = r.project ? null : projectLabels(r.projects);
  const lists = await Promise.all(r.projects.map(async (p) => (await listServices(db, p.id, ctx.app.config.now())).map((s) => (labels ? { ...s, project: labels[p.id] } : s))));
  const envs = await Promise.all(r.projects.map((p) => environmentsOf(db, p.id, [])));
  sendJson(ctx.res, 200, {
    services: lists.flat(),
    environments: [...new Set([...envs.flat(), ...(await ctx.app.telemetry.traceEnvs(r.scope))])].filter(Boolean).sort(),
    projects: [],
    ...(await ctx.app.telemetry.counts(r.scope)),
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
