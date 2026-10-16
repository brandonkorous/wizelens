import { hashToken, newId, newToken } from "../auth/crypto.js";
import type { Ctx } from "../app.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { getTrace } from "../repo/trace-read.js";

const DAY_MS = 86_400_000;

export interface Share {
  id: string;
  traceId: string;
  createdMs: number;
  expiresMs: number;
  views: number;
}

/** A read-only link to one trace, valid for 1 to 30 days. Only the token's hash is kept. */
async function create(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  const body = await readJsonBody(ctx.req);
  const traceId = str(body, "traceId");
  const days = Number(body.days ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 30) fail(400, "A link lasts 1 to 30 days.");
  if (!(await getTrace(ctx.app.db, project.id, traceId))) fail(404, "Trace not found.");
  const now = ctx.app.config.now();
  const token = newToken("share");
  await ctx.app.db.query("INSERT INTO shares (id, project_id, trace_id, token_hash, created_by, created_ms, expires_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    newId(),
    project.id,
    traceId,
    hashToken(token),
    actor,
    now,
    now + days * DAY_MS,
  ]);
  await audit(ctx.app.db, project.orgId, actor, "share.create", { projectId: project.id, traceId, days }, now);
  sendJson(ctx.res, 201, { url: `${ctx.app.baseUrl(ctx.req)}/_wizelens/#/shared/${token}`, expiresMs: now + days * DAY_MS });
}

async function list(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const rows = await ctx.app.db.query<Share>(
    `SELECT id, trace_id AS "traceId", created_ms AS "createdMs", expires_ms AS "expiresMs", views FROM shares
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

/** Anyone with the link can read the trace while the link is valid. Nothing else is reachable with it. */
async function open(ctx: Ctx): Promise<void> {
  const now = ctx.app.config.now();
  const [row] = await ctx.app.db.query<{ project_id: string; trace_id: string; expires_ms: number }>(
    "UPDATE shares SET views = views + 1 WHERE token_hash = $1 AND revoked_ms IS NULL AND expires_ms > $2 RETURNING project_id, trace_id, expires_ms",
    [hashToken(ctx.params.token!), now],
  );
  const trace = row ? await getTrace(ctx.app.db, row.project_id, row.trace_id) : undefined;
  if (!row || !trace) return fail(404, "This link is not valid any more.");
  sendJson(ctx.res, 200, { trace, expiresMs: row.expires_ms });
}

export function shareRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/projects/:project/shares", create)
    .on("GET", "api/projects/:project/shares", list)
    .on("DELETE", "api/projects/:project/shares/:id", revoke)
    .on("GET", "api/shared/:token", open);
}
