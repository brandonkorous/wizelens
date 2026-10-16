import { toSummary } from "@wizeworks/lens-core";
import { parseJson, readBody } from "@wizeworks/lens-hub/kit";
import { DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, handleMcp, type McpDataSource } from "@wizeworks/lens-node/kit";
import type { Ctx } from "../app.js";
import { principalOf, requireProject } from "../auth/principal.js";
import { fail } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { getTrace, queryTraces } from "../repo/trace-read.js";
import { projectMetrics } from "./metrics.js";

/** Traces the MCP tools search through, newest first. */
const MCP_RECENT = 500;

/** The project to read: `?project=`, or the only project of the read key. */
async function projectId(ctx: Ctx): Promise<string> {
  const id = ctx.url.searchParams.get("project");
  if (id) return id;
  const p = await principalOf(ctx);
  if (p?.kind === "key" && p.key.projectIds.length === 1) return p.key.projectIds[0]!;
  return fail(400, "Add ?project=<project id>. Read keys for one project do not need it.");
}

/** `POST /_wizelens/mcp`: the same read-only tools as the add-ons, for one project. Needs a read key: agents get only what it allows. */
async function mcp(ctx: Ctx): Promise<void> {
  if ((await principalOf(ctx))?.kind !== "key") fail(401, "Send a read key: Authorization: Bearer wl_rk_...");
  const access = await requireProject(ctx, await projectId(ctx));
  const { project, actor } = access;
  const db = ctx.app.db;
  const recent = await queryTraces(db, { projectId: project.id, limit: MCP_RECENT });
  const writes: Promise<void>[] = [];
  const data: McpDataSource = {
    service: project.name,
    version: ctx.app.version,
    slowQueryMs: DEFAULT_SLOW_QUERY_MS,
    nPlusOneThreshold: DEFAULT_N_PLUS_ONE,
    list: (limit) => recent.slice(0, limit).map(toSummary),
    all: () => recent,
    get: (traceId) => getTrace(db, project.id, traceId),
    metrics: (range, params) => projectMetrics(db, project.id, range, params, { now: ctx.app.config.now(), limit: ctx.app.config.maxMetricPoints }),
    // Every tool call is kept in the organization's audit log.
    audit: (line) => void writes.push(audit(db, project.orgId, actor, "mcp.call", { projectId: project.id, line }, ctx.app.config.now())),
  };
  const body = ctx.req.method === "POST" ? parseJson(await readBody(ctx.req)) : undefined;
  await handleMcp(data, ctx.req, ctx.res, body);
  // The audit lines are written before this request is done; a failed write is logged, never lost silently.
  for (const r of await Promise.allSettled(writes)) if (r.status === "rejected") console.error("[wizelens-cloud] audit write failed:", r.reason);
}

export function mcpRoutes(r: Router<Ctx>): void {
  r.on("POST", "mcp", mcp).on("GET", "mcp", mcp).on("DELETE", "mcp", mcp);
}
