import { isAPIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import type { Ctx } from "../app.js";
import { createOrgFor } from "../auth/auth.js";
import { requireOrg, requireUser } from "../auth/principal.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit, listAudit } from "../repo/audit.js";
import { orgDeletionNotice } from "../notify/team.js";
import { deleteOrgEverything, listMembers, pendingInvites, setRetention } from "../repo/orgs.js";
import { listKeys, listProjects } from "../repo/projects.js";
import { orgProjectIds } from "../repo/trace-join.js";
import { clearProjects } from "../telemetry/index.js";

// Members, roles, and invites change through Better Auth (`api/auth/organization/*`). These routes add what it does not have.
const now = (ctx: Ctx) => ctx.app.config.now();

async function overview(ctx: Ctx): Promise<void> {
  const { role } = await requireOrg(ctx, ctx.params.org!, "read");
  const db = ctx.app.db;
  const id = ctx.params.org!;
  const manage = role === "owner" || role === "admin";
  sendJson(ctx.res, 200, {
    role,
    members: await listMembers(db, id),
    projects: await listProjects(db, id),
    invites: manage ? await pendingInvites(db, id) : [],
    keys: manage ? await listKeys(db, id) : [],
  });
}

async function newOrg(ctx: Ctx): Promise<void> {
  const user = await requireUser(ctx);
  const name = str(await readJsonBody(ctx.req), "name");
  sendJson(ctx.res, 201, await createOrgFor(ctx.app.auth, { db: ctx.app.db, retentionDays: ctx.app.config.retentionDays }, user.id, name));
}

async function changeOrg(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  const body = await readJsonBody(ctx.req);
  const days = body.retentionDays;
  if (days !== undefined && (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 400)) fail(400, "Retention is 1 to 400 days.");
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : undefined;
  if (name) await ctx.app.db.query("UPDATE orgs SET name = $1 WHERE id = $2", [name, ctx.params.org!]);
  if (days !== undefined) await setRetention(ctx.app.db, ctx.params.org!, days as number);
  await audit(ctx.app.db, ctx.params.org!, `user:${user.id}`, "org.update", { name, retentionDays: days }, now(ctx));
  sendJson(ctx.res, 200, { ok: true });
}

/** Owners only, with their password again: the organization and all of its data go at once. */
async function deleteOrg(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "own");
  const password = str(await readJsonBody(ctx.req), "password");
  try {
    await ctx.app.auth.api.verifyPassword({ body: { password }, headers: fromNodeHeaders(ctx.req.headers) });
  } catch (err) {
    if (isAPIError(err)) fail(400, "The password is not right.");
    throw err;
  }
  const tell = await orgDeletionNotice(ctx.app, ctx.params.org!, user.id);
  const projects = await orgProjectIds(ctx.app.db, ctx.params.org!);
  await ctx.app.db.tx((q) => deleteOrgEverything(q, ctx.params.org!));
  await clearProjects(ctx.app.telemetry, projects);
  tell();
  sendJson(ctx.res, 200, { ok: true });
}

async function auditLog(ctx: Ctx): Promise<void> {
  await requireOrg(ctx, ctx.params.org!, "manage");
  const before = Number(ctx.url.searchParams.get("before")) || undefined;
  sendJson(ctx.res, 200, await listAudit(ctx.app.db, ctx.params.org!, 100, before));
}

export function orgRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/orgs", newOrg)
    .on("GET", "api/orgs/:org", overview)
    .on("PATCH", "api/orgs/:org", changeOrg)
    .on("DELETE", "api/orgs/:org", deleteOrg)
    .on("GET", "api/orgs/:org/audit", auditLog);
}
