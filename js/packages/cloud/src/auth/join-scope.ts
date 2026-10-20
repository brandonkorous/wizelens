import type { Queryable } from "../db/db.js";
import { membership } from "../repo/orgs.js";
import { hiddenProjects } from "../repo/project-roles.js";
import { inOrg, orgProjectIds } from "../repo/trace-join.js";
import { type TenantScope, tenantScope } from "../telemetry/store.js";
import type { ProjectAccess } from "./principal.js";

/** The primary project first, then the others. */
const primaryFirst = (orgId: string, primary: string, ids: readonly string[]) => tenantScope(orgId, [primary, ...ids.filter((id) => id !== primary)]);

/** Projects whose trace parts this caller may see: the primary project's organization only; a person sees all of it, a key or app only its own projects. */
export async function joinScope(q: Queryable, access: ProjectAccess): Promise<TenantScope> {
  const { project, principal } = access;
  const own = principal.kind === "key" ? principal.key.projectIds : principal.kind === "app" ? principal.projectIds : null;
  const hidden = principal.kind === "user" ? await hiddenProjects(q, project.orgId, principal.user.id) : new Set<string>();
  const ids = own ? await inOrg(q, project.orgId, own) : await orgProjectIds(q, project.orgId);
  return primaryFirst(project.orgId, project.id, ids.filter((id) => !hidden.has(id)));
}

/** For a share link: what its maker may read now. A maker who left the organization, or is not a person, gets only the shared project. */
export async function makerScope(q: Queryable, createdBy: string, orgId: string, projectId: string): Promise<TenantScope> {
  const userId = createdBy.startsWith("user:") ? createdBy.slice("user:".length) : "";
  if (!userId || !(await membership(q, userId, orgId))) return tenantScope(orgId, [projectId]);
  const hidden = await hiddenProjects(q, orgId, userId);
  return primaryFirst(orgId, projectId, (await orgProjectIds(q, orgId)).filter((id) => !hidden.has(id)));
}
