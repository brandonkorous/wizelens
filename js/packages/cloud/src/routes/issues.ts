import { applyIssueChange, type IssueChange, type IssueState, parseIssueChanges, unlabelKey } from "@wizeworks/lens-core";
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

/** `POST api/projects/:project/issues`: resolve, ignore, reopen, or assign one error group or insight, or many with `keys`. Members who can write only. */
async function change(ctx: Ctx): Promise<void> {
  const cs = parseIssueChanges(await readJsonBody(ctx.req));
  if (typeof cs === "string") return fail(400, cs);
  const issues = await changeIn(ctx, ctx.params.project!, cs);
  sendJson(ctx.res, 200, { issue: issues[0] ?? null, issues });
}

/** Labeled error groups by their project; the rest (insights, unlabeled keys) change in every project. */
function splitByProject(cs: IssueChange[], projects: Parameters<typeof projectLabels>[0]) {
  const labels = projectLabels(projects);
  const byProject = new Map<string, IssueChange[]>();
  const everywhere: IssueChange[] = [];
  for (const c of cs) {
    const u = c.kind === "error" && projects.length > 1 ? unlabelKey("err.g", c.key, labels) : null;
    if (u?.project) byProject.set(u.project, [...(byProject.get(u.project) ?? []), { ...c, key: u.key }]);
    else everywhere.push(c);
  }
  return { byProject, everywhere };
}

/** `POST api/orgs/:org/issues` (All projects): a labeled error group changes in its project; an insight in every project the caller may write. */
async function changeAcross(ctx: Ctx): Promise<void> {
  const a = await requireOrgRead(ctx, ctx.params.org!);
  const cs = parseIssueChanges(await readJsonBody(ctx.req));
  if (typeof cs === "string") return fail(400, cs);
  const { byProject, everywhere } = splitByProject(cs, a.projects);
  const issues: (IssueState | null)[] = [];
  for (const [project, list] of byProject) issues.push(...(await changeIn(ctx, project, list)));
  if (everywhere.length) {
    const results = await Promise.all(a.projects.map((p) => changeIn(ctx, p.id, everywhere).catch(() => undefined)));
    if (results.every((r) => r === undefined) && !issues.length) return fail(403, "You cannot change issues in these projects.");
    issues.push(...(results.find((r) => r !== undefined) ?? []));
  }
  sendJson(ctx.res, 200, { issue: issues[0] ?? null, issues });
}

/** What the audit keeps of a change: the one key, or every key of a change to many. */
function auditDetail(project: { id: string; name: string }, cs: IssueChange[]) {
  const c = cs[0]!;
  const keys = cs.length === 1 ? { key: c.key } : { keys: cs.map((x) => x.key) };
  return { projectId: project.id, name: project.name, kind: c.kind, ...keys, ...(c.untilMs ? { untilMs: c.untilMs } : {}), ...(c.assignee ? { assignee: c.assignee } : {}) };
}

/** Apply the changes in one project, in one go, with the write check and one audit entry. */
async function changeIn(ctx: Ctx, projectId: string, cs: IssueChange[]): Promise<(IssueState | null)[]> {
  const { project, actor } = await requireProject(ctx, projectId, "write");
  const assignee = cs.find((c) => c.action === "assign")?.assignee;
  if (assignee && !(await assignableMembers(ctx.app.db, project.orgId)).some((m) => m.id === assignee)) fail(400, "Assign to a member of this organization.");
  const now = ctx.app.config.now();
  const next = await ctx.app.db.tx(async (q) => {
    const out: (IssueState | null)[] = [];
    for (const c of cs) {
      const state = applyIssueChange(await issueOf(q, project.id, c.kind, c.key), c, now);
      await saveIssue(q, project.id, c.kind, c.key, state, actor);
      out.push(state);
    }
    await audit(q, project.orgId, actor, `issue.${cs[0]!.action}`, auditDetail(project, cs), now);
    return out;
  });
  forgetModels(project.id);
  return next;
}

export function issueRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/issues", list).on("POST", "api/projects/:project/issues", change).on("POST", "api/orgs/:org/issues", changeAcross);
}
