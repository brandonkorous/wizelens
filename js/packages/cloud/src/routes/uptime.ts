import { parseCheckInput, sameCheckProblem, shownHeaders, UPTIME_LIMITS, type UptimeCheck, type UptimeCheckInput, uptimeList } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { type ProjectAccess, requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { checkById, countChecks, createCheck, deleteCheck, listChecks, listIncidents, updateCheck } from "../repo/uptime.js";
import { checkUrlProblem, runCloudCheck } from "../uptime/run.js";

const shown = (c: UptimeCheck | undefined) => c && { ...c, headers: shownHeaders(c.headers) };
/** The URL as the audit log keeps it: no query string. */
const urlOf = (url: string) => url.split("?")[0]!;

/** A check from the body, with the same rules as the hub, an address the cloud may call, and not one the project has. */
async function inputOf(ctx: Ctx, projectId: string, current?: UptimeCheck): Promise<UptimeCheckInput> {
  const parsed = parseCheckInput(await readJsonBody(ctx.req), current);
  if (!parsed.ok) return fail(400, parsed.error);
  const problem = await checkUrlProblem(parsed.input.url, ctx.app.config.allowPrivateTargets);
  if (problem) fail(400, `${parsed.input.url}: ${problem}`);
  const twin = sameCheckProblem(await listChecks(ctx.app.db, ctx.app.secrets, projectId), parsed.input, current?.id);
  if (twin) fail(409, twin);
  return parsed.input;
}

async function list(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const now = ctx.app.config.now();
  const checks = await listChecks(ctx.app.db, ctx.app.secrets, project.id);
  sendJson(ctx.res, 200, uptimeList(checks, await listIncidents(ctx.app.db, project.id, now), now));
}

async function create(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  if ((await countChecks(ctx.app.db, project.id)) >= UPTIME_LIMITS.maxChecks) fail(400, `A project runs at most ${UPTIME_LIMITS.maxChecks} checks.`);
  const input = await inputOf(ctx, project.id);
  const now = ctx.app.config.now();
  const id = await createCheck(ctx.app.db, ctx.app.secrets, project.id, input, actor, now);
  await audit(ctx.app.db, project.orgId, actor, "uptime.create", { projectId: project.id, checkId: id, name: input.name, url: urlOf(input.url) }, now);
  sendJson(ctx.res, 201, shown(await checkById(ctx.app.db, ctx.app.secrets, project.id, id)));
}

/** The check named in the path, with write access checked. */
async function writable(ctx: Ctx) {
  const access: ProjectAccess = await requireProject(ctx, ctx.params.project!, "write");
  const check = await checkById(ctx.app.db, ctx.app.secrets, access.project.id, ctx.params.id!);
  if (!check) return fail(404, "Check not found.");
  return { ...access, check };
}

async function change(ctx: Ctx): Promise<void> {
  const { project, actor, check } = await writable(ctx);
  const input = await inputOf(ctx, project.id, check);
  const now = ctx.app.config.now();
  await updateCheck(ctx.app.db, ctx.app.secrets, check, input, now);
  await audit(ctx.app.db, project.orgId, actor, "uptime.update", { projectId: project.id, checkId: check.id, name: input.name, url: urlOf(input.url), enabled: input.enabled }, now);
  sendJson(ctx.res, 200, shown(await checkById(ctx.app.db, ctx.app.secrets, project.id, check.id)));
}

async function remove(ctx: Ctx): Promise<void> {
  const { project, actor, check } = await writable(ctx);
  await deleteCheck(ctx.app.db, project.id, check.id);
  await audit(ctx.app.db, project.orgId, actor, "uptime.delete", { projectId: project.id, checkId: check.id, name: check.name }, ctx.app.config.now());
  sendJson(ctx.res, 200, { ok: true });
}

/** Run a check now, for "does it work?" after a change. */
async function runNow(ctx: Ctx): Promise<void> {
  const { project, check } = await writable(ctx);
  await runCloudCheck(ctx.app, check);
  sendJson(ctx.res, 200, shown(await checkById(ctx.app.db, ctx.app.secrets, project.id, check.id)));
}

export function uptimeRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/uptime", list)
    .on("POST", "api/projects/:project/uptime", create)
    .on("PATCH", "api/projects/:project/uptime/:id", change)
    .on("DELETE", "api/projects/:project/uptime/:id", remove)
    .on("POST", "api/projects/:project/uptime/:id/run", runNow);
}
