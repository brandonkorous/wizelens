import type { Ctx } from "../app.js";
import { requireOrg } from "../auth/principal.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { createKey, createProject, deleteProject, deleteProjectData, type KeyKind, listProjects, projectInOrg, revokeKey } from "../repo/projects.js";

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

/** PATCH a project's settings: `logRetentionDays` (1 to 400, or null for the organization's retention). */
async function changeProject(ctx: Ctx): Promise<void> {
  const { org, project } = ctx.params as { org: string; project: string };
  const { user } = await requireOrg(ctx, org, "manage");
  if (!(await projectInOrg(ctx.app.db, org, project))) return fail(404, "Project not found.");
  const days = (await readJsonBody(ctx.req)).logRetentionDays;
  if (days !== null && (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 400)) fail(400, "Log retention is 1 to 400 days, or null to follow the organization.");
  await ctx.app.db.query("UPDATE projects SET log_retention_days = $1 WHERE id = $2", [days, project]);
  await audit(ctx.app.db, org, `user:${user.id}`, "project.update", { projectId: project, logRetentionDays: days }, now(ctx));
  sendJson(ctx.res, 200, await projectInOrg(ctx.app.db, org, project));
}

/** Ingest keys belong to one project. Read keys name the projects they may read. */
async function newKey(ctx: Ctx): Promise<void> {
  const org = ctx.params.org!;
  const { user } = await requireOrg(ctx, org, "manage");
  const body = await readJsonBody(ctx.req);
  const kind = body.kind as KeyKind;
  if (kind !== "ingest" && kind !== "read") fail(400, 'Set kind to "ingest" or "read".');
  const known = new Set((await listProjects(ctx.app.db, org)).map((p) => p.id));
  const ids = Array.isArray(body.projectIds) ? body.projectIds.filter((id): id is string => typeof id === "string" && known.has(id)) : [];
  if (ids.length === 0 || (kind === "ingest" && ids.length !== 1)) fail(400, "Pick one project for an ingest key, or one or more for a read key.");
  const key = await createKey(ctx.app.db, org, kind, str(body, "name", false), ids, user.id, now(ctx));
  await audit(ctx.app.db, org, `user:${user.id}`, "key.create", { keyId: key.id, kind, projectIds: ids }, now(ctx));
  sendJson(ctx.res, 201, key);
}

async function dropKey(ctx: Ctx): Promise<void> {
  const { org, key } = ctx.params as { org: string; key: string };
  const { user } = await requireOrg(ctx, org, "manage");
  if (!(await revokeKey(ctx.app.db, org, key, now(ctx)))) fail(404, "Key not found.");
  await audit(ctx.app.db, org, `user:${user.id}`, "key.revoke", { keyId: key }, now(ctx));
  sendJson(ctx.res, 200, { ok: true });
}

export function projectRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/orgs/:org/projects", newProject)
    .on("PATCH", "api/orgs/:org/projects/:project", changeProject)
    .on("DELETE", "api/orgs/:org/projects/:project", dropProject)
    .on("POST", "api/orgs/:org/projects/:project/clear", dropProject)
    .on("POST", "api/orgs/:org/keys", newKey)
    .on("DELETE", "api/orgs/:org/keys/:key", dropKey);
}
