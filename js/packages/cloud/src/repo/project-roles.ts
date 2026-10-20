// Roles per project: a member or viewer can get more or less on one project, or none. Owners and admins keep their organization role.
import type { Role } from "../auth/roles.js";
import type { Queryable } from "../db/db.js";

export const PROJECT_ROLES = ["none", "viewer", "member", "admin"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export const isProjectRole = (v: unknown): v is ProjectRole => typeof v === "string" && (PROJECT_ROLES as readonly string[]).includes(v);

/** SQL with `m` (members) and `p` (projects): the member may see the project. */
export const VISIBLE_TO_MEMBER =
  "(m.role IN ('owner', 'admin') OR NOT EXISTS (SELECT 1 FROM project_roles pr WHERE pr.project_id = p.id AND pr.user_id = m.user_id AND pr.role = 'none'))";

/** Org roles a project role can change. */
export const overridable = (orgRole: Role): boolean => orgRole === "member" || orgRole === "viewer";

/** The role a person has on a project; null when they may not see it. */
export function effectiveRole(orgRole: Role, projectRole: ProjectRole | undefined): Role | null {
  if (!projectRole || !overridable(orgRole)) return orgRole;
  return projectRole === "none" ? null : projectRole;
}

export async function projectRoleOf(q: Queryable, projectId: string, userId: string): Promise<ProjectRole | undefined> {
  const [row] = await q.query<{ role: string }>("SELECT role FROM project_roles WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
  return isProjectRole(row?.role) ? row.role : undefined;
}

export interface ProjectRoleRow {
  projectId: string;
  userId: string;
  role: ProjectRole;
}

/** Every project role in an organization. */
export const listProjectRoles = (q: Queryable, orgId: string): Promise<ProjectRoleRow[]> =>
  q.query<ProjectRoleRow>(
    `SELECT r.project_id AS "projectId", r.user_id AS "userId", r.role FROM project_roles r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1`,
    [orgId],
  );

/** Set or clear (null) one person's role on a project. */
export async function setProjectRole(q: Queryable, projectId: string, userId: string, role: ProjectRole | null): Promise<void> {
  if (role) await q.query("INSERT INTO project_roles (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3", [projectId, userId, role]);
  else await q.query("DELETE FROM project_roles WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
}

/** Drop a person's project roles in an organization: they left, or became an owner or admin. */
export async function clearProjectRoles(q: Queryable, orgId: string, userId: string): Promise<void> {
  await q.query("DELETE FROM project_roles r USING projects p WHERE p.id = r.project_id AND p.org_id = $1 AND r.user_id = $2", [orgId, userId]);
}

/** Drop project roles of people who are no longer members of the organization. */
export async function pruneProjectRoles(q: Queryable, orgId: string): Promise<void> {
  await q.query(
    "DELETE FROM project_roles r USING projects p WHERE p.id = r.project_id AND p.org_id = $1 AND NOT EXISTS (SELECT 1 FROM members m WHERE m.org_id = $1 AND m.user_id = r.user_id)",
    [orgId],
  );
}

/** Projects of an organization a person may not see. */
export async function hiddenProjects(q: Queryable, orgId: string, userId: string): Promise<Set<string>> {
  const rows = await q.query<{ id: string }>(
    `SELECT p.id FROM projects p JOIN members m ON m.org_id = p.org_id AND m.user_id = $2 WHERE p.org_id = $1 AND NOT ${VISIBLE_TO_MEMBER}`,
    [orgId, userId],
  );
  return new Set(rows.map((r) => r.id));
}
