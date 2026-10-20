import { isPageName, isTimeRange } from "@wizeworks/lens-core";
import { hashToken, newId, newToken } from "../auth/crypto.js";
import type { Ctx } from "../app.js";
import { makerScope } from "../auth/join-scope.js";
import { projectScope } from "../telemetry/store.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { projectPage } from "./models.js";

const DAY_MS = 86_400_000;

/** Pages a link can share: their numbers are kept as they were when the link was made. */
const SHAREABLE = new Set(["overview", "requests", "errors", "error", "database", "query", "logs", "insights", "rendering", "route", "services", "service", "endpoint", "traces"]);
const SNAPSHOT_MAX = 2_000_000;

export interface Share {
  id: string;
  traceId: string;
  /** For a page link: the page and its title. Empty for a trace link. */
  page: string;
  title: string;
  createdMs: number;
  expiresMs: number;
  views: number;
}

/** A page's numbers now, for a page link: the page, its range or window, and its filters. */
async function snapshotOf(ctx: Ctx, project: { id: string; orgId: string }, body: Record<string, unknown>): Promise<{ page: string; title: string; snapshot: string; params: string }> {
  const page = str(body, "page");
  if (!SHAREABLE.has(page) || !isPageName(page)) return fail(400, "This page cannot be shared.");
  const range = typeof body.range === "string" && isTimeRange(body.range) ? body.range : "24h";
  const raw = body.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : {};
  const params = Object.fromEntries(Object.entries(raw).filter(([k, v]) => typeof v === "string" && k !== "project").map(([k, v]) => [k, (v as string).slice(0, 500)]));
  const snapshot = JSON.stringify(await projectPage(ctx.app, project, page, range, params, typeof body.env === "string" && body.env ? body.env : undefined));
  if (snapshot.length > SNAPSHOT_MAX) return fail(400, "This page is too big to share. Narrow the filters.");
  return { page, title: (typeof body.title === "string" ? body.title : page).slice(0, 200), snapshot, params: JSON.stringify(params) };
}

/** A read-only link to one trace, or to one page as it is now, valid for 1 to 30 days. Only the token's hash is kept. */
async function create(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  const body = await readJsonBody(ctx.req);
  const days = Number(body.days ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 30) fail(400, "A link lasts 1 to 30 days.");
  const traceId = body.page ? "" : str(body, "traceId");
  if (traceId && !(await ctx.app.telemetry.trace(projectScope(project), traceId))) fail(404, "Trace not found.");
  const shot = body.page ? await snapshotOf(ctx, project, body) : { page: "", title: "", snapshot: null, params: "{}" };
  const now = ctx.app.config.now();
  const token = newToken("share");
  await ctx.app.db.query(
    "INSERT INTO shares (id, project_id, trace_id, token_hash, created_by, created_ms, expires_ms, page, title, snapshot, params) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [newId(), project.id, traceId, hashToken(token), actor, now, now + days * DAY_MS, shot.page, shot.title, shot.snapshot, shot.params],
  );
  await audit(ctx.app.db, project.orgId, actor, "share.create", { projectId: project.id, ...(traceId ? { traceId } : { page: shot.page }), days }, now);
  sendJson(ctx.res, 201, { url: `${ctx.app.baseUrl(ctx.req)}/_wizelens/#/shared/${token}`, expiresMs: now + days * DAY_MS });
}

async function list(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const rows = await ctx.app.db.query<Share>(
    `SELECT id, trace_id AS "traceId", page, title, created_ms AS "createdMs", expires_ms AS "expiresMs", views FROM shares
     WHERE project_id = $1 AND revoked_ms IS NULL AND expires_ms > $2 ORDER BY created_ms DESC`,
    [project.id, ctx.app.config.now()],
  );
  sendJson(ctx.res, 200, rows);
}

async function revoke(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  const now = ctx.app.config.now();
  const rows = await ctx.app.db.query("UPDATE shares SET revoked_ms = $1 WHERE project_id = $2 AND id = $3 AND revoked_ms IS NULL RETURNING id", [now, project.id, ctx.params.id]);
  if (rows.length === 0) fail(404, "Link not found.");
  await audit(ctx.app.db, project.orgId, actor, "share.revoke", { projectId: project.id, shareId: ctx.params.id }, now);
  sendJson(ctx.res, 200, { ok: true });
}

/** Anyone with the link can read the trace while it is valid, joined only as far as its maker may read now. Nothing else is reachable with it. */
async function open(ctx: Ctx): Promise<void> {
  const now = ctx.app.config.now();
  const db = ctx.app.db;
  const [row] = await db.query<{ project_id: string; trace_id: string; expires_ms: number; created_by: string; org_id: string; page: string; title: string; snapshot: string | null; created_ms: number; params: string }>(
    `UPDATE shares s SET views = views + 1 FROM projects p WHERE s.token_hash = $1 AND s.revoked_ms IS NULL AND s.expires_ms > $2 AND p.id = s.project_id
     RETURNING s.project_id, s.trace_id, s.expires_ms, s.created_by, p.org_id, s.page, s.title, s.snapshot, s.created_ms, s.params`,
    [hashToken(ctx.params.token!), now],
  );
  if (row?.page && row.snapshot) return sendJson(ctx.res, 200, { page: row.page, title: row.title, params: JSON.parse(row.params), model: JSON.parse(row.snapshot), createdMs: Number(row.created_ms), expiresMs: row.expires_ms });
  const scope = row && (await makerScope(db, row.created_by, row.org_id, row.project_id));
  const trace = row && scope ? await ctx.app.telemetry.joinedTrace(row.project_id, scope, row.trace_id) : undefined;
  if (!row || !trace) return fail(404, "This link is not valid any more.");
  sendJson(ctx.res, 200, { trace, expiresMs: row.expires_ms });
}

export function shareRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/projects/:project/shares", create)
    .on("GET", "api/projects/:project/shares", list)
    .on("DELETE", "api/projects/:project/shares/:id", revoke)
    .on("GET", "api/shared/:token", open);
}
