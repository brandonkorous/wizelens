import { statusPageView } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { hashToken, newToken } from "../auth/crypto.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { listChecks, listIncidents } from "../repo/uptime.js";

interface StatusRow {
  title: string;
  createdMs: number;
  views: number;
}

const titleOf = (body: Record<string, unknown>, fallback: string) => (typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 100) : fallback);

/** Whether the project has a public status page. The link itself is shown once, when it is made. */
async function settings(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const [row] = await ctx.app.db.query<StatusRow>(`SELECT title, created_ms AS "createdMs", views FROM status_pages WHERE project_id = $1`, [project.id]);
  sendJson(ctx.res, 200, row ? { enabled: true, ...row } : { enabled: false });
}

/** Turn the page on, or make a new link (the old one stops working). Only the token's hash is kept. */
async function enable(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  const title = titleOf(await readJsonBody(ctx.req), project.name);
  const token = newToken("status");
  const now = ctx.app.config.now();
  const rotated = await ctx.app.db.query(
    `INSERT INTO status_pages (project_id, token_hash, title, created_by, created_ms) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id) DO UPDATE SET token_hash = excluded.token_hash, title = excluded.title, created_by = excluded.created_by,
       created_ms = excluded.created_ms, views = 0 RETURNING (xmax <> 0) AS rotated`,
    [project.id, hashToken(token), title, actor, now],
  );
  await audit(ctx.app.db, project.orgId, actor, "status.enable", { projectId: project.id, title, newLink: !!(rotated[0] as { rotated?: boolean })?.rotated }, now);
  sendJson(ctx.res, 201, { url: `${ctx.app.baseUrl(ctx.req)}/_wizelens/#/status/${token}`, title });
}

async function rename(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!, "write");
  const title = titleOf(await readJsonBody(ctx.req), project.name);
  const rows = await ctx.app.db.query("UPDATE status_pages SET title = $2 WHERE project_id = $1 RETURNING project_id", [project.id, title]);
  if (rows.length === 0) fail(404, "This project has no status page.");
  sendJson(ctx.res, 200, { title });
}

async function disable(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  const rows = await ctx.app.db.query("DELETE FROM status_pages WHERE project_id = $1 RETURNING project_id", [project.id]);
  if (rows.length === 0) fail(404, "This project has no status page.");
  await audit(ctx.app.db, project.orgId, actor, "status.disable", { projectId: project.id }, ctx.app.config.now());
  sendJson(ctx.res, 200, { ok: true });
}

/** Anyone with the link sees the project's checks: names, state, uptime, and incident times. Nothing else is reachable with it. */
async function open(ctx: Ctx): Promise<void> {
  const db = ctx.app.db;
  const [row] = await db.query<{ project_id: string; title: string }>("UPDATE status_pages SET views = views + 1 WHERE token_hash = $1 RETURNING project_id, title", [hashToken(ctx.params.token!)]);
  if (!row) return fail(404, "This status page does not exist.");
  const now = ctx.app.config.now();
  const checks = await listChecks(db, ctx.app.secrets, row.project_id);
  ctx.res.setHeader("Cache-Control", "no-store");
  sendJson(ctx.res, 200, statusPageView(row.title, checks, await listIncidents(db, row.project_id, now), now));
}

export function statusRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/status-page", settings)
    .on("POST", "api/projects/:project/status-page", enable)
    .on("PATCH", "api/projects/:project/status-page", rename)
    .on("DELETE", "api/projects/:project/status-page", disable)
    .on("GET", "api/status/:token", open);
}
