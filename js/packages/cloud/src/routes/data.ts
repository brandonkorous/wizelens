import type { ServiceInfo } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { joinScope } from "../auth/join-scope.js";
import { principalOf, type ProjectAccess, requireProject } from "../auth/principal.js";
import { fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { forgetOfflineServices } from "../repo/services.js";
import { environmentsOf, listServices, type TraceQuery } from "../repo/trace-read.js";

const DAY_MS = 86_400_000;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (p: URLSearchParams, k: string) => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);

/** The project named by `?project=`, with access checked. */
export async function projectOf(ctx: Ctx): Promise<ProjectAccess> {
  const id = ctx.url.searchParams.get("project");
  if (!id) return fail(400, "Add ?project=<project id>.");
  return requireProject(ctx, id);
}

async function retentionMs(ctx: Ctx): Promise<number> {
  const id = ctx.url.searchParams.get("project");
  const p = id ? await principalOf(ctx) : undefined;
  if (!id || !p) return ctx.app.config.retentionDays * DAY_MS;
  const access = await requireProject(ctx, id).catch(() => undefined);
  if (!access) return ctx.app.config.retentionDays * DAY_MS;
  const [row] = await ctx.app.db.query<{ d: number }>("SELECT retention_days AS d FROM orgs WHERE id = $1", [access.project.orgId]);
  return (row?.d ?? ctx.app.config.retentionDays) * DAY_MS;
}

async function info(ctx: Ctx): Promise<void> {
  const value: ServiceInfo = {
    mode: "cloud",
    capabilities: ["environments", "registry", "accounts", "alerts", "sharing", "serverStats", "metrics", "serverMetrics", "search", "changes", "issues", "infra", "uptime", "statusPages", "sourcemaps", "savedSearches", "slos"],
    service: "WizeLens Cloud",
    version: ctx.app.version,
    runtime: `node ${process.version}`,
    mcp: true,
    startedMs: ctx.app.startedMs,
    // PGlite is Postgres in-process: both keep data across restarts.
    storage: { kind: "postgres", maxAgeMs: await retentionMs(ctx) },
    redactKeys: [...ctx.app.config.redactKeys],
  };
  sendJson(ctx.res, 200, value);
}

async function traces(ctx: Ctx): Promise<void> {
  const { project } = await projectOf(ctx);
  const p = ctx.url.searchParams;
  const full = p.get("full") === "true";
  const q: TraceQuery = { projectId: project.id, limit: clamp(num(p, "limit") ?? (full ? 1000 : 50), 1, full ? 5000 : 1000) };
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
  const scope = ctx.url.searchParams.get("join") === "false" ? [access.project.id] : await joinScope(ctx.app.db, access);
  const t = await ctx.app.telemetry.joinedTrace(access.project.id, scope, ctx.params.id!);
  if (!t) fail(404, "Trace not found.");
  sendJson(ctx.res, 200, t);
}

async function services(ctx: Ctx): Promise<void> {
  const { project } = await projectOf(ctx);
  const db = ctx.app.db;
  sendJson(ctx.res, 200, {
    services: await listServices(db, project.id, ctx.app.config.now()),
    environments: await environmentsOf(db, project.id, await ctx.app.telemetry.traceEnvs(project.id)),
    projects: [],
    ...(await ctx.app.telemetry.counts(project.id)),
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
