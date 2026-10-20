import { applyIssueChange, type IssueChange, parseIssueChange, unlabelKey } from "@wizeworks/lens-core";
import { requireOrgRead } from "../auth/org-access.js";
import type { Ctx } from "../app.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { assignableMembers, issueOf, listIssues, saveIssue } from "../repo/issues.js";
import { forgetModels } from "./models.js";
import { projectLabels } from "./scope.js";

/** `GET api/projects/:project/issues`: every issue state, and the members issues can be assigned to. */
async function list(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const [issues, members] = await Promise.all([listIssues(ctx.app.db, project.id), assignableMembers(ctx.app.db, project.orgId)]);
  sendJson(ctx.res, 200, { issues, members });
}

/** `POST api/projects/:project/issues`: resolve, ignore, reopen, or assign one error group or insight. Members who can write only. */
async function change(ctx: Ctx): Promise<void> {
  const c = parseIssueChange(await readJsonBody(ctx.req));
  if (typeof c === "string") return fail(400, c);
  sendJson(ctx.res, 200, { issue: await changeIn(ctx, ctx.params.project!, c) });
}

/** `POST api/orgs/:org/issues` (All projects): a labeled error group changes in its project; an insight in every project the caller may write. */
async function changeAcross(ctx: Ctx): Promise<void> {
  const a = await requireOrgRead(ctx, ctx.params.org!);
  const c = parseIssueChange(await readJsonBody(ctx.req));
  if (typeof c === "string") return fail(400, c);
  const labels = projectLabels(a.projects);
  const u = c.kind === "error" && a.projects.length > 1 ? unlabelKey("err.g", c.key, labels) : null;
  if (u?.project) return sendJson(ctx.res, 200, { issue: await changeIn(ctx, u.project, { ...c, key: u.key }) });
  const results = await Promise.all(a.projects.map((p) => changeIn(ctx, p.id, c).catch(() => undefined)));
  if (results.every((r) => r === undefined)) return fail(403, "You cannot change issues in these projects.");
  sendJson(ctx.res, 200, { issue: results.find((r) => r !== undefined) ?? null });
}

/** Apply one change in one project, with the write check and the audit entry. */
async function changeIn(ctx: Ctx, projectId: string, c: IssueChange) {
  const { project, actor } = await requireProject(ctx, projectId, "write");
  if (c.action === "assign" && c.assignee && !(await assignableMembers(ctx.app.db, project.orgId)).some((m) => m.id === c.assignee)) fail(400, "Assign to a member of this organization.");
  const now = ctx.app.config.now();
  const next = await ctx.app.db.tx(async (q) => {
    const state = applyIssueChange(await issueOf(q, project.id, c.kind, c.key), c, now);
    await saveIssue(q, project.id, c.kind, c.key, state, actor);
    await audit(q, project.orgId, actor, `issue.${c.action}`, { projectId: project.id, name: project.name, kind: c.kind, key: c.key, ...(c.untilMs ? { untilMs: c.untilMs } : {}), ...(c.assignee ? { assignee: c.assignee } : {}) }, now);
    return state;
  });
  forgetModels(project.id);
  return next;
}

export function issueRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/issues", list).on("POST", "api/projects/:project/issues", change).on("POST", "api/orgs/:org/issues", changeAcross);
}
