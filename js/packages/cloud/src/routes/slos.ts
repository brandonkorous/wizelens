import { parseApdexTargets, parseSlo, type Slo, sloReport } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { apdexTargets, createSlo, deleteSlo, listSlos, saveApdexTargets, sloById, updateSlo } from "../repo/slos.js";
import { projectRetentionMs, projectScopeOf } from "../scale-exec.js";
import { forgetModels } from "./models.js";

/** The stats of a project, read as far back as its organization keeps data. */
async function executorOf(ctx: Ctx, projectId: string) {
  return ctx.app.telemetry.executor(await projectScopeOf(ctx.app.db, projectId), await projectRetentionMs(ctx.app.db, projectId, ctx.app.config.retentionDays));
}

async function list(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const ex = await executorOf(ctx, project.id);
  const now = ctx.app.config.now();
  const slos = await Promise.all((await listSlos(ctx.app.db, project.id)).map((s) => sloReport(s, ex, now)));
  sendJson(ctx.res, 200, { slos, apdex: await apdexTargets(ctx.app.db, project.id) });
}

async function one(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const slo = await sloById(ctx.app.db, project.id, ctx.params.id!);
  if (!slo) return fail(404, "SLO not found.");
  sendJson(ctx.res, 200, await sloReport(slo, await executorOf(ctx, project.id), ctx.app.config.now()));
}

async function input(ctx: Ctx, current?: Slo) {
  const s = parseSlo({ ...current, ...(await readJsonBody(ctx.req)) });
  return typeof s === "string" ? fail(400, s) : s;
}

async function create(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  const s = await input(ctx);
  const now = ctx.app.config.now();
  const id = await createSlo(ctx.app.db, project.id, s, actor, now);
  await audit(ctx.app.db, project.orgId, actor, "slo.create", { projectId: project.id, name: s.name }, now);
  sendJson(ctx.res, 201, await sloById(ctx.app.db, project.id, id));
}

async function change(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!, "write");
  const current = await sloById(ctx.app.db, project.id, ctx.params.id!);
  if (!current) return fail(404, "SLO not found.");
  await updateSlo(ctx.app.db, project.id, current.id, await input(ctx, current));
  sendJson(ctx.res, 200, await sloById(ctx.app.db, project.id, current.id));
}

async function remove(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  if (!(await deleteSlo(ctx.app.db, project.id, ctx.params.id!))) return fail(404, "SLO not found.");
  await audit(ctx.app.db, project.orgId, actor, "slo.delete", { projectId: project.id, id: ctx.params.id }, ctx.app.config.now());
  sendJson(ctx.res, 200, { ok: true });
}

async function getApdex(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  sendJson(ctx.res, 200, { apdex: await apdexTargets(ctx.app.db, project.id) });
}

/** Replace the project's Apdex targets; pages show the new scores at once. */
async function putApdex(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!, "write");
  const t = parseApdexTargets((await readJsonBody(ctx.req)).apdex);
  if (typeof t === "string") return fail(400, t);
  await saveApdexTargets(ctx.app.db, project.id, t);
  forgetModels(project.id);
  sendJson(ctx.res, 200, { apdex: t });
}

export function sloRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/slos", list)
    .on("POST", "api/projects/:project/slos", create)
    .on("GET", "api/projects/:project/slos/:id", one)
    .on("PATCH", "api/projects/:project/slos/:id", change)
    .on("DELETE", "api/projects/:project/slos/:id", remove)
    .on("GET", "api/projects/:project/apdex", getApdex)
    .on("PUT", "api/projects/:project/apdex", putApdex);
}
