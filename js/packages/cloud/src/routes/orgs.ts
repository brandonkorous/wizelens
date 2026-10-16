import type { Ctx } from "../app.js";
import { requireOrg, requireUser } from "../auth/principal.js";
import { canGrant, isRole, type Role } from "../auth/roles.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit, listAudit } from "../repo/audit.js";
import { createInvite, createOrg, listMembers, ownerCount, pendingInvites, removeMember, setRole, updateOrg } from "../repo/orgs.js";
import { createProject, listKeys, listProjects } from "../repo/projects.js";

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
    invites: manage ? await pendingInvites(db, id, now(ctx)) : [],
    keys: manage ? await listKeys(db, id) : [],
  });
}

async function newOrg(ctx: Ctx): Promise<void> {
  const user = await requireUser(ctx);
  const body = await readJsonBody(ctx.req);
  const org = await ctx.app.db.tx(async (q) => {
    const o = await createOrg(q, str(body, "name"), user.id, now(ctx), ctx.app.config.retentionDays);
    await createProject(q, o.id, "My app", now(ctx));
    await audit(q, o.id, `user:${user.id}`, "org.create", { name: o.name }, now(ctx));
    return o;
  });
  sendJson(ctx.res, 201, org);
}

async function changeOrg(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  const body = await readJsonBody(ctx.req);
  const days = body.retentionDays;
  if (days !== undefined && (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 400)) fail(400, "Retention is 1 to 400 days.");
  const name = typeof body.name === "string" && body.name.trim() ? body.name : undefined;
  await updateOrg(ctx.app.db, ctx.params.org!, { name, retentionDays: days as number | undefined });
  await audit(ctx.app.db, ctx.params.org!, `user:${user.id}`, "org.update", { name, retentionDays: days }, now(ctx));
  sendJson(ctx.res, 200, { ok: true });
}

async function invite(ctx: Ctx): Promise<void> {
  const { user, role } = await requireOrg(ctx, ctx.params.org!, "manage");
  const body = await readJsonBody(ctx.req);
  const target = body.role ?? "member";
  if (!isRole(target) || !canGrant(role, target)) return fail(400, "Pick a role at or below your own.");
  const email = str(body, "email");
  const token = await createInvite(ctx.app.db, ctx.params.org!, email, target, user.id, now(ctx));
  await audit(ctx.app.db, ctx.params.org!, `user:${user.id}`, "member.invite", { email, role: target }, now(ctx));
  sendJson(ctx.res, 201, { url: `${ctx.app.baseUrl(ctx.req)}/_wizelens/#/join/${token}`, expiresInDays: 7 });
}

async function applyMemberChange(ctx: Ctx, actorRole: Role, targetRole: Role, lastOwner: boolean): Promise<void> {
  const { org, userId } = ctx.params as { org: string; userId: string };
  if (ctx.req.method === "DELETE") {
    if (lastOwner) fail(409, "An organization needs at least one owner.");
    return removeMember(ctx.app.db, org, userId);
  }
  const next = (await readJsonBody(ctx.req)).role;
  if (!isRole(next) || !canGrant(actorRole, next)) return fail(400, "Pick a role at or below your own.");
  if (lastOwner && next !== "owner") fail(409, "An organization needs at least one owner.");
  if (targetRole !== next) await setRole(ctx.app.db, org, userId, next);
}

async function changeMember(ctx: Ctx): Promise<void> {
  const { user, role } = await requireOrg(ctx, ctx.params.org!, "manage");
  const { org, userId } = ctx.params as { org: string; userId: string };
  const target = (await listMembers(ctx.app.db, org)).find((m) => m.userId === userId);
  if (!target) return fail(404, "Member not found.");
  if (!canGrant(role, target.role)) fail(403, "You cannot change someone above your role.");
  const lastOwner = target.role === "owner" && (await ownerCount(ctx.app.db, org)) === 1;
  await applyMemberChange(ctx, role, target.role, lastOwner);
  await audit(ctx.app.db, org, `user:${user.id}`, ctx.req.method === "DELETE" ? "member.remove" : "member.role", { userId }, now(ctx));
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
    .on("POST", "api/orgs/:org/invites", invite)
    .on("PATCH", "api/orgs/:org/members/:userId", changeMember)
    .on("DELETE", "api/orgs/:org/members/:userId", changeMember)
    .on("GET", "api/orgs/:org/audit", auditLog);
}
