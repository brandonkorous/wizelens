// Reading across an organization ("All projects"): every project the caller may read there, and nothing outside it.
import type { Ctx } from "../app.js";
import { fail } from "../http/http.js";
import { membership } from "../repo/orgs.js";
import { hiddenProjects } from "../repo/project-roles.js";
import { listProjects, type Project } from "../repo/projects.js";
import { principalOf, type Principal } from "./principal.js";

export interface OrgAccess {
  orgId: string;
  /** The projects the caller may read, by name. */
  projects: Project[];
  /** "user:<id>" or "key:<id>", for the audit log. */
  actor: string;
  principal: Principal;
}

/** The projects of one organization a person or read key may read: a person's minus hidden ones, a key's own. 404 when none. */
export async function requireOrgRead(ctx: Ctx, orgId: string): Promise<OrgAccess> {
  const p = await principalOf(ctx);
  if (!p) return fail(401, "Sign in, or send a read key.");
  const db = ctx.app.db;
  const all = await listProjects(db, orgId);
  let projects: Project[];
  if (p.kind === "key") projects = p.key.orgId === orgId ? all.filter((x) => p.key.projectIds.includes(x.id)) : [];
  else if (!(await membership(db, p.user.id, orgId))) projects = [];
  else {
    const hidden = await hiddenProjects(db, orgId, p.user.id);
    projects = all.filter((x) => !hidden.has(x.id));
  }
  if (!projects.length) return fail(404, "No project you can read in this organization.");
  return { orgId, projects, actor: p.kind === "key" ? `key:${p.key.id}` : `user:${p.user.id}`, principal: p };
}
