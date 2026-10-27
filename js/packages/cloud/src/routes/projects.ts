import type { Ctx } from "../app.js";
import { requireRetention } from "../billing/gate.js";
import { requireOrg } from "../auth/principal.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { membership } from "../repo/orgs.js";
import { isProjectRole, overridable, type ProjectRole, setProjectRole } from "../repo/project-roles.js";
import { createProject, deleteProject, deleteProjectData, type Project, projectInOrg } from "../repo/projects.js";

const now = (ctx: Ctx) => ctx.app.config.now();

async function newProject(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  const p = await createProject(ctx.app.db, ctx.params.org!, str(await readJsonBody(ctx.req), "name"), now(ctx));
  await audit(ctx.app.db, ctx.params.org!, `user:${user.id}`, "project.create", { projectId: p.id, name: p.name }, now(ctx));
  sendJson(ctx.res, 201, p);
}

/** DELETE removes the project. POST .../clear removes its data and keeps the project. */
async function dropProject(ctx: Ctx): Promise<void> {
  const { org, project } = ctx.params as { org: string; project: string };
  const { user } = await requireOrg(ctx, org, "manage");
  const found = await projectInOrg(ctx.app.db, org, project);
  if (!found) return fail(404, "Project not found.");
  const clearOnly = ctx.req.method === "POST";
  await ctx.app.db.tx((q) => (clearOnly ? deleteProjectData(q, project) : deleteProject(q, project)));
  await ctx.app.telemetry.clearProject(project);
  await audit(ctx.app.db, org, `user:${user.id}`, clearOnly ? "project.clear" : "project.delete", { projectId: project, name: found.name }, now(ctx));
  sendJson(ctx.res, 200, { ok: true });
}

async function rename(ctx: Ctx, p: Project, raw: unknown, actor: string): Promise<void> {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || name.length > 100) fail(400, "A project name is 1 to 100 characters.");
  await ctx.app.db.query("UPDATE projects SET name = $1 WHERE id = $2", [name, p.id]);
  await audit(ctx.app.db, p.orgId, actor, "project.rename", { projectId: p.id, from: p.name, to: name }, now(ctx));
}

async function setLogDays(ctx: Ctx, p: Project, days: unknown, actor: string): Promise<void> {
  if (days !== null && (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 400)) fail(400, "Log retention is 1 to 400 days, or null to follow the organization.");
  // Logs may outlast the traces, never the plan.
  if (days !== null) await requireRetention(ctx.app, p.orgId, days as number);
  await ctx.app.db.query("UPDATE projects SET log_retention_days = $1 WHERE id = $2", [days, p.id]);
  await audit(ctx.app.db, p.orgId, actor, "project.update", { projectId: p.id, logRetentionDays: days }, now(ctx));
}

/** PATCH a project: `name` (1 to 100 characters) and `logRetentionDays` (1 to 400, or null for the organization's retention). */
async function changeProject(ctx: Ctx): Promise<void> {
  const { org, project } = ctx.params as { org: string; project: string };
  const { user } = await requireOrg(ctx, org, "manage");
  const found = await projectInOrg(ctx.app.db, org, project);
  if (!found) return fail(404, "Project not found.");
  const body = await readJsonBody(ctx.req);
  if (!("name" in body) && !("logRetentionDays" in body)) fail(400, "Send a name or logRetentionDays.");
  if ("name" in body) await rename(ctx, found, body.name, `user:${user.id}`);
  if ("logRetentionDays" in body) await setLogDays(ctx, found, body.logRetentionDays, `user:${user.id}`);
  sendJson(ctx.res, 200, await projectInOrg(ctx.app.db, org, project));
}

/** Give a member or viewer more, less, or no access to one project; null goes back to their organization role. */
async function setRole(ctx: Ctx): Promise<void> {
  const { org, project, user: target } = ctx.params as { org: string; project: string; user: string };
  const { user } = await requireOrg(ctx, org, "manage");
  if (!(await projectInOrg(ctx.app.db, org, project))) fail(404, "Project not found.");
  const m = await membership(ctx.app.db, target, org);
  if (!m) return fail(404, "Member not found.");
  if (!overridable(m.role)) fail(400, "Owners and admins always keep their organization role on every project.");
  const role = (await readJsonBody(ctx.req)).role ?? null;
  if (role !== null && !isProjectRole(role)) fail(400, "Pick none, viewer, member, admin, or null for the organization role.");
  await setProjectRole(ctx.app.db, project, target, role as ProjectRole | null);
  await audit(ctx.app.db, org, `user:${user.id}`, "project.role", { projectId: project, userId: target, role }, now(ctx));
  sendJson(ctx.res, 200, { ok: true });
}

export function projectRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/orgs/:org/projects", newProject)
    .on("PATCH", "api/orgs/:org/projects/:project", changeProject)
    .on("DELETE", "api/orgs/:org/projects/:project", dropProject)
    .on("POST", "api/orgs/:org/projects/:project/clear", dropProject)
    .on("PUT", "api/orgs/:org/projects/:project/roles/:user", setRole);
}
