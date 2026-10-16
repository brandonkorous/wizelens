/** Roles in an organization, from most to least power. */
export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** What each role may do. Read: data, members. Write: alerts, shares. Manage: projects, keys, members, settings. */
export type Permission = "read" | "write" | "manage" | "own";

const LEVEL: Record<Role, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };
const NEEDS: Record<Permission, number> = { read: 0, write: 1, manage: 2, own: 3 };

export const can = (role: Role, permission: Permission): boolean => LEVEL[role] >= NEEDS[permission];

/** An admin may not give a role above their own. */
export const canGrant = (actor: Role, target: Role): boolean => LEVEL[actor] >= LEVEL[target];
