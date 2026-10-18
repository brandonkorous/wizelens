import { toSummary, type Trace } from "@wizeworks/lens-core";
import { parseJson, readBody } from "@wizeworks/lens-hub/kit";
import { DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, handleMcp, type McpDataSource, type McpProjects } from "@wizeworks/lens-node/kit";
import type { Ctx } from "../app.js";
import { joinScope } from "../auth/join-scope.js";
import { type Principal, principalOf, type ProjectAccess, requireProject } from "../auth/principal.js";
import { fail } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { projectMetrics } from "./metrics.js";

/** Traces the MCP tools search through, newest first. */
const MCP_RECENT = 500;

type Writes = Promise<void>[];
type KeyPrincipal = Principal & { kind: "key" };

/** One project's data. Its recent traces load only when a tool asks, once per request. */
async function projectSource(ctx: Ctx, access: ProjectAccess, writes: Writes): Promise<McpDataSource> {
  const { project, actor } = access;
  const { db, telemetry } = ctx.app;
  const scope = await joinScope(db, access);
  let recent: Promise<Trace[]> | undefined;
  const traces = () => (recent ??= telemetry.traces({ projectId: project.id, limit: MCP_RECENT }));
  return {
    service: project.name,
    version: ctx.app.version,
    slowQueryMs: DEFAULT_SLOW_QUERY_MS,
    nPlusOneThreshold: DEFAULT_N_PLUS_ONE,
    list: async (limit) => (await traces()).slice(0, limit).map(toSummary),
    all: traces,
    get: (traceId, federate) => telemetry.joinedTrace(project.id, federate ? scope : [project.id], traceId),
    metrics: (range, params) => projectMetrics(telemetry, project.id, range, params, { now: ctx.app.config.now() }),
    search: (q) => telemetry.search(project.id, q),
    suggest: (r) => telemetry.suggest(project.id, r),
    now: () => ctx.app.config.now(),
    // Every tool call is kept in the organization's audit log.
    audit: (line) => void writes.push(audit(db, project.orgId, actor, "mcp.call", { projectId: project.id, line }, ctx.app.config.now())),
  };
}

/** A read key for several projects: the tools take a `project` argument, and list_projects names them. */
async function projectsSource(ctx: Ctx, p: KeyPrincipal, writes: Writes): Promise<McpProjects> {
  const { db } = ctx.app;
  const projects = await db.query<{ id: string; name: string }>("SELECT id, name FROM projects WHERE org_id = $1 AND id = ANY($2) ORDER BY name", [p.key.orgId, [...p.key.projectIds]]);
  return {
    service: "wizelens-cloud",
    version: ctx.app.version,
    slowQueryMs: DEFAULT_SLOW_QUERY_MS,
    nPlusOneThreshold: DEFAULT_N_PLUS_ONE,
    metrics: true,
    projects,
    open: async (id) => projectSource(ctx, await requireProject(ctx, id), writes),
    audit: (line) => void writes.push(audit(db, p.key.orgId, `key:${p.key.id}`, "mcp.call", { line }, ctx.app.config.now())),
  };
}

/** `?project=`, or the only project of the key, reads one project. Otherwise every project of the key. */
async function sourceOf(ctx: Ctx, p: KeyPrincipal, writes: Writes): Promise<McpDataSource | McpProjects> {
  const id = ctx.url.searchParams.get("project") ?? (p.key.projectIds.length === 1 ? p.key.projectIds[0] : undefined);
  return id ? projectSource(ctx, await requireProject(ctx, id), writes) : projectsSource(ctx, p, writes);
}

/** `POST /_wizelens/mcp`: the same read-only tools as the add-ons. Needs a read key: agents get only what it allows. */
async function mcp(ctx: Ctx): Promise<void> {
  const p = await principalOf(ctx);
  if (p?.kind !== "key") return fail(401, "Send a read key: Authorization: Bearer wl_rk_...");
  const writes: Writes = [];
  const data = await sourceOf(ctx, p, writes);
  const body = ctx.req.method === "POST" ? parseJson(await readBody(ctx.req)) : undefined;
  await handleMcp(data, ctx.req, ctx.res, body);
  // The audit lines are written before this request is done; a failed write is logged, never lost silently.
  for (const r of await Promise.allSettled(writes)) if (r.status === "rejected") console.error("[wizelens-cloud] audit write failed:", r.reason);
}

export function mcpRoutes(r: Router<Ctx>): void {
  r.on("POST", "mcp", mcp).on("GET", "mcp", mcp).on("DELETE", "mcp", mcp);
}
