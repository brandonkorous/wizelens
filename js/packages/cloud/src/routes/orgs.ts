import { isAPIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import type { Ctx } from "../app.js";
import { createOrgFor } from "../auth/auth.js";
import { requireOrg, requireUser } from "../auth/principal.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { requireRetention } from "../billing/gate.js";
import { audit, auditFacets, auditFilterOf, countAudit, listAudit } from "../repo/audit.js";
import { hasLivePlan } from "../repo/billing.js";
import { hiddenProjects, listProjectRoles } from "../repo/project-roles.js";
import { orgDeletionNotice } from "../notify/team.js";
import { deleteOrgEverything, listMembers, pendingInvites, setRetention } from "../repo/orgs.js";
import { listKeys, listProjects } from "../repo/projects.js";
import { exposedKeys, revokedInUse } from "../repo/key-exposed.js";
import { orgProjectIds } from "../repo/trace-join.js";
import { clearProjects } from "../telemetry/index.js";

// Members, roles, and invites change through Better Auth (`api/auth/organization/*`). These routes add what it does not have.
const now = (ctx: Ctx) => ctx.app.config.now();

/** The organization's keys, each with the last time a public page sent with it when it is a secret key. */
async function keysWithExposure(db: Ctx["app"]["db"], orgId: string) {
  const seen = await exposedKeys(db, orgId);
  return (await listKeys(db, orgId)).map((k) => ({ ...k, exposed: seen.get(k.id) ?? null }));
}

async function overview(ctx: Ctx): Promise<void> {
  const { role, user } = await requireOrg(ctx, ctx.params.org!, "read");
  const db = ctx.app.db;
  const id = ctx.params.org!;
  const manage = role === "owner" || role === "admin";
  const hidden = manage ? new Set<string>() : await hiddenProjects(db, id, user.id);
  sendJson(ctx.res, 200, {
    role,
    members: await listMembers(db, id),
    projects: (await listProjects(db, id)).filter((p) => !hidden.has(p.id)),
    invites: manage ? await pendingInvites(db, id) : [],
    keys: manage ? await keysWithExposure(db, id) : [],
    revokedInUse: manage ? await revokedInUse(db, id, now(ctx)) : [],
    projectRoles: manage ? await listProjectRoles(db, id) : [],
  });
}

async function newOrg(ctx: Ctx): Promise<void> {
  const user = await requireUser(ctx);
  const name = str(await readJsonBody(ctx.req), "name");
  sendJson(ctx.res, 201, await createOrgFor(ctx.app.auth, { db: ctx.app.db, retentionDays: ctx.app.config.retentionDays, billingOn: ctx.app.billing.on }, user.id, name));
}

async function changeOrg(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  const body = await readJsonBody(ctx.req);
  const days = body.retentionDays;
  if (days !== undefined && (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 400)) fail(400, "Retention is 1 to 400 days.");
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : undefined;
  if (days !== undefined) await requireRetention(ctx.app, ctx.params.org!, days as number);
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
  if (await hasLivePlan(ctx.app.db, ctx.params.org!)) fail(409, "Cancel the paid plan first: Billing, Manage billing. Then delete the organization.");
  const tell = await orgDeletionNotice(ctx.app, ctx.params.org!, user.id);
  const projects = await orgProjectIds(ctx.app.db, ctx.params.org!);
  await ctx.app.db.tx((q) => deleteOrgEverything(q, ctx.params.org!));
  await clearProjects(ctx.app.telemetry, projects);
  tell();
  sendJson(ctx.res, 200, { ok: true });
}

const AUDIT_PAGE = 100;

/** `GET api/orgs/:org/audit`: newest first, `limit` (1 to 500) at a time; page with `offset`, or back with `before` = the last time. */
async function auditLog(ctx: Ctx): Promise<void> {
  await requireOrg(ctx, ctx.params.org!, "manage");
  const p = ctx.url.searchParams;
  const limit = Math.min(500, Math.max(1, Number(p.get("limit")) || AUDIT_PAGE));
  const offset = Math.max(0, Math.floor(Number(p.get("offset")) || 0));
  sendJson(ctx.res, 200, await listAudit(ctx.app.db, ctx.params.org!, limit, auditFilterOf(p), offset));
}

/** `GET api/orgs/:org/audit/count`: `{ total }` lines that match the same filter. */
async function auditCount(ctx: Ctx): Promise<void> {
  await requireOrg(ctx, ctx.params.org!, "manage");
  sendJson(ctx.res, 200, { total: await countAudit(ctx.app.db, ctx.params.org!, auditFilterOf(ctx.url.searchParams)) });
}

async function auditFacetsOf(ctx: Ctx): Promise<void> {
  await requireOrg(ctx, ctx.params.org!, "manage");
  sendJson(ctx.res, 200, await auditFacets(ctx.app.db, ctx.params.org!));
}

export function orgRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/orgs", newOrg)
    .on("GET", "api/orgs/:org", overview)
    .on("PATCH", "api/orgs/:org", changeOrg)
    .on("DELETE", "api/orgs/:org", deleteOrg)
    .on("GET", "api/orgs/:org/audit", auditLog)
    .on("GET", "api/orgs/:org/audit/facets", auditFacetsOf)
    .on("GET", "api/orgs/:org/audit/count", auditCount);
}
