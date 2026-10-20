import type { Trace } from "@wizeworks/lens-core";
import { parseJson, readBody } from "@wizeworks/lens-hub/kit";
import { handleMcp, type McpDataSource, type McpProjects } from "@wizeworks/lens-node/kit";
import type { Ctx } from "../app.js";
import { joinScope } from "../auth/join-scope.js";
import { projectScope } from "../telemetry/store.js";
import { OAUTH_SCOPES } from "../auth/oauth.js";
import { appPrincipalOf } from "../auth/oauth-access.js";
import type { AppPrincipal, Principal, ProjectAccess } from "../auth/principal.js";
import { bearerOf, fail, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { listEvents } from "../repo/alert-events.js";
import { listRules } from "../repo/alerts.js";
import { audit } from "../repo/audit.js";
import { keyAllows, keyByToken, listProjects, projectInOrg } from "../repo/projects.js";
import { allSource } from "./mcp-all.js";
import { projectTags } from "../repo/tags.js";
import { projectMetrics } from "./metrics.js";
import { projectPage } from "./models.js";
import { resourceMetadataUrl } from "./oauth-meta.js";
import { thresholdsOf } from "../repo/settings.js";

/** Traces the MCP tools search through, newest first. */
const MCP_RECENT = 500;
/** Newest alert events get_alerts lists. */
const ALERT_EVENTS = 50;

type Writes = Promise<void>[];

/** Who reads: a read key, or a connected app (OAuth) for the person who connected it. Both read only their projects. */
interface Reader {
  orgId: string;
  projectIds: readonly string[];
  actor: string;
  /** The connected app's name, kept with each audit line. */
  via?: string;
  principal: Principal | AppPrincipal;
}

/** One project's data. Its recent traces load only when a tool asks, once per request. */
async function projectSource(ctx: Ctx, access: ProjectAccess, r: Reader, writes: Writes): Promise<McpDataSource> {
  const { project, actor } = access;
  const { db, telemetry } = ctx.app;
  const scope = await joinScope(db, access);
  let recent: Promise<Trace[]> | undefined;
  const own = projectScope(project);
  const traces = () => (recent ??= telemetry.traces({ scope: own, limit: MCP_RECENT }));
  return {
    service: project.name,
    version: ctx.app.version,
    ...thresholdsOf(ctx.app.config, await ctx.app.settings.get(project.id)),
    all: traces,
    get: (traceId, federate) => telemetry.joinedTrace(project.id, federate ? scope : own, traceId),
    metrics: (range, params) => projectMetrics(telemetry, own, range, params, { now: ctx.app.config.now() }),
    search: (q) => telemetry.search(own, q),
    suggest: (r) => telemetry.suggest(own, r),
    page: (page, range, params) => projectPage(ctx.app, project, page, range, params),
    alerts: async () => ({ rules: await listRules(db, project.id), events: await listEvents(db, project.id, ALERT_EVENTS) }),
    now: () => ctx.app.config.now(),
    tags: () => projectTags(db, project.id),
    // Every tool call is kept in the organization's audit log.
    audit: (line) => void writes.push(audit(db, project.orgId, actor, "mcp.call", { projectId: project.id, line, ...(r.via ? { app: r.via } : {}) }, ctx.app.config.now())),
  };
}

/** One of the reader's projects, or 404. */
async function accessOf(ctx: Ctx, r: Reader, projectId: string): Promise<ProjectAccess> {
  const project = r.projectIds.includes(projectId) ? await projectInOrg(ctx.app.db, r.orgId, projectId) : undefined;
  if (!project) return fail(404, "Project not found.");
  return { project, actor: r.actor, role: "viewer", principal: r.principal };
}

/** Several projects: the tools take a `project` argument, and list_projects names them. */
async function projectsSource(ctx: Ctx, r: Reader, writes: Writes): Promise<McpProjects> {
  const { db } = ctx.app;
  const projects = (await listProjects(db, r.orgId)).filter((p) => r.projectIds.includes(p.id));
  return {
    service: "wizelens-cloud",
    version: ctx.app.version,
    slowQueryMs: ctx.app.config.slowQueryMs,
    nPlusOneThreshold: ctx.app.config.nPlusOneThreshold,
    metrics: true,
    overview: true,
    alerts: true,
    projects,
    open: async (id) => projectSource(ctx, await accessOf(ctx, r, id), r, writes),
    all: () => allSource(ctx, r, projects, writes),
    audit: (line) => void writes.push(audit(db, r.orgId, r.actor, "mcp.call", { line, ...(r.via ? { app: r.via } : {}) }, ctx.app.config.now())),
  };
}

/** `?project=`, or the only project, reads one project. Otherwise every project the reader has. */
async function sourceOf(ctx: Ctx, r: Reader, writes: Writes): Promise<McpDataSource | McpProjects> {
  const id = ctx.url.searchParams.get("project") ?? (r.projectIds.length === 1 ? r.projectIds[0] : undefined);
  return id ? projectSource(ctx, await accessOf(ctx, r, id), r, writes) : projectsSource(ctx, r, writes);
}

/** 401 with the RFC 9728 pointer, so an MCP client can find where to sign in. */
function unauthorized(ctx: Ctx, invalid: boolean): void {
  const scope = OAUTH_SCOPES.join(" ");
  const challenge = `Bearer resource_metadata="${resourceMetadataUrl(ctx.app, ctx.req)}", scope="${scope}"${invalid ? ', error="invalid_token"' : ""}`;
  sendJson(ctx.res, 401, { error: "Connect with OAuth (your MCP client signs you in), or send a read key: Authorization: Bearer wl_rk_..." }, { "WWW-Authenticate": challenge });
}

/** The reader behind a bearer token: a read key (`wl_rk_`), else an OAuth access token. */
async function readerOf(ctx: Ctx, bearer: string): Promise<Reader | undefined> {
  if (bearer.startsWith("wl_rk_")) {
    const key = await keyByToken(ctx.app.db, bearer, ctx.app.config.now());
    return key?.kind === "read" && keyAllows(key, "mcp") ? { orgId: key.orgId, projectIds: key.projectIds, actor: `key:${key.id}`, principal: { kind: "key", key } } : undefined;
  }
  const app = await appPrincipalOf(ctx, bearer);
  return app && { orgId: app.orgId, projectIds: app.principal.projectIds, actor: `user:${app.principal.userId}`, via: app.principal.app, principal: app.principal };
}

/** `POST /_wizelens/mcp`: the same read-only tools as the add-ons, for a read key or a connected app. */
async function mcp(ctx: Ctx): Promise<void> {
  const bearer = bearerOf(ctx.req);
  const reader = bearer ? await readerOf(ctx, bearer) : undefined;
  if (!reader) return unauthorized(ctx, !!bearer);
  const writes: Writes = [];
  const data = await sourceOf(ctx, reader, writes);
  const body = ctx.req.method === "POST" ? parseJson(await readBody(ctx.req)) : undefined;
  await handleMcp(data, ctx.req, ctx.res, body);
  // The audit lines are written before this request is done; a failed write is logged, never lost silently.
  for (const r of await Promise.allSettled(writes)) if (r.status === "rejected") console.error("[wizelens-cloud] audit write failed:", r.reason);
}

export function mcpRoutes(r: Router<Ctx>): void {
  r.on("POST", "mcp", mcp).on("GET", "mcp", mcp).on("DELETE", "mcp", mcp);
}
