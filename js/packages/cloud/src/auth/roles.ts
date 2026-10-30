import { ACCESS_STATEMENTS, type AccessGrant, isOrgRole, ORG_ROLES, type OrgRole, ROLE_GRANTS, ROLE_RANK, roleAllows } from "@wizeworks/lens-core/internal";
import { createAccessControl } from "better-auth/plugins/access";

/** Roles in an organization, from most to least power. */
export const ROLES = ORG_ROLES;
export type Role = OrgRole;
export const isRole = isOrgRole;

/** Better Auth access control, built from the shared role data. */
export const ac = createAccessControl(ACCESS_STATEMENTS);
export const authRoles = Object.fromEntries(ROLES.map((r) => [r, ac.newRole(ROLE_GRANTS[r] as Parameters<typeof ac.newRole>[0])])) as Record<Role, ReturnType<typeof ac.newRole>>;

/** What our own routes check. Read: data, members. Write: alerts, shares. Tag: tag rules. Manage: projects, keys, settings. Own: delete the organization. */
export type Permission = "read" | "write" | "tag" | "manage" | "own";

const NEEDS: Record<Permission, AccessGrant> = {
  read: { project: ["read"] },
  write: { alert: ["create"], share: ["create"] },
  tag: { tag: ["create", "update", "delete"] },
  manage: { project: ["create"], key: ["create"] },
  own: { organization: ["delete"] },
};

export const can = (role: Role, permission: Permission): boolean => roleAllows(role, NEEDS[permission]);

/** An admin may not give a role above their own. */
export const canGrant = (actor: Role, target: Role): boolean => ROLE_RANK[actor] >= ROLE_RANK[target];
