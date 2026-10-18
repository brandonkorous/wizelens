import type { ServiceInfo } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { joinScope } from "../auth/join-scope.js";
import { principalOf, type ProjectAccess, requireProject } from "../auth/principal.js";
import { fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { getJoinedTrace } from "../repo/trace-join.js";
import { countRows, environmentsOf, listServices, queryTraces, type TraceQuery } from "../repo/trace-read.js";

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
    capabilities: ["environments", "registry", "accounts", "alerts", "sharing", "serverStats", "metrics", "serverMetrics"],
    service: "WizeLens Cloud",
    version: ctx.app.version,
    runtime: `node ${process.version}`,
    mcp: true,
    startedMs: ctx.app.startedMs,
    storage: { kind: ctx.app.db.kind === "postgres" ? "postgres" : "sqlite", maxAgeMs: await retentionMs(ctx) },
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
  const list = await queryTraces(ctx.app.db, q);
  sendJson(ctx.res, 200, full ? list : list.map(({ spans: _s, logs: _l, remotes: _r, ...summary }) => summary));
}

// One trace, with its parts from the other projects the caller may read in the same organization (`join=false`: this project only).
async function trace(ctx: Ctx): Promise<void> {
  const access = await projectOf(ctx);
  const scope = ctx.url.searchParams.get("join") === "false" ? [access.project.id] : await joinScope(ctx.app.db, access);
  const t = await getJoinedTrace(ctx.app.db, access.project.id, scope, ctx.params.id!);
  if (!t) fail(404, "Trace not found.");
  sendJson(ctx.res, 200, t);
}

async function services(ctx: Ctx): Promise<void> {
  const { project } = await projectOf(ctx);
  const db = ctx.app.db;
  sendJson(ctx.res, 200, {
    services: await listServices(db, project.id, ctx.app.config.now()),
    environments: await environmentsOf(db, project.id),
    projects: [],
    ...(await countRows(db, project.id)),
  });
}

export function dataRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/info", info)
    .on("GET", "api/traces", traces)
    .on("GET", "api/traces/:id", trace)
    .on("GET", "api/services", services);
}
