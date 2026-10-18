import type { Queryable } from "../db/db.js";
import { membership } from "../repo/orgs.js";
import { inOrg, orgProjectIds } from "../repo/trace-join.js";
import type { ProjectAccess } from "./principal.js";

const primaryFirst = (primary: string, ids: readonly string[]) => [primary, ...ids.filter((id) => id !== primary)];

/** Projects whose trace parts this caller may see: the primary project's organization only; a person sees all of it, a read key only its own projects. */
export async function joinScope(q: Queryable, access: ProjectAccess): Promise<string[]> {
  const { project, principal } = access;
  const ids = principal.kind === "key" ? await inOrg(q, project.orgId, principal.key.projectIds) : await orgProjectIds(q, project.orgId);
  return primaryFirst(project.id, ids);
}

/** For a share link: what its maker may read now. A maker who left the organization, or is not a person, gets only the shared project. */
export async function makerScope(q: Queryable, createdBy: string, orgId: string, projectId: string): Promise<string[]> {
  const userId = createdBy.startsWith("user:") ? createdBy.slice("user:".length) : "";
  if (!userId || !(await membership(q, userId, orgId))) return [projectId];
  return primaryFirst(projectId, await orgProjectIds(q, orgId));
}
