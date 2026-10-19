// Cloud roles as plain data. The cloud and the dashboard each build Better Auth access control from it (docs/CONTRACT.md, "Tenancy and access").

/** Every resource and action an organization role can be granted. The first five are Better Auth's own. */
export const ACCESS_STATEMENTS = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
  project: ["read", "create", "update", "delete"],
  key: ["read", "create", "revoke"],
  alert: ["read", "create", "update", "delete"],
  share: ["create", "revoke"],
  audit: ["read"],
  tag: ["create", "update", "delete"],
} as const;

export type AccessStatements = typeof ACCESS_STATEMENTS;
export type AccessResource = keyof AccessStatements;
export type AccessGrant = { [R in AccessResource]?: readonly AccessStatements[R][number][] };

export const ORG_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

const ALL_DATA = {
  project: ["read", "create", "update", "delete"],
  key: ["read", "create", "revoke"],
  alert: ["read", "create", "update", "delete"],
  share: ["create", "revoke"],
  audit: ["read"],
  tag: ["create", "update", "delete"],
} as const satisfies AccessGrant;
const READ = { project: ["read"], key: ["read"], alert: ["read"], ac: ["read"] } as const satisfies AccessGrant;
const PEOPLE = { member: ["create", "update", "delete"], invitation: ["create", "cancel"], ac: ["create", "read", "update", "delete"] } as const satisfies AccessGrant;

/** What each role may do. Viewers read; members also make alerts, tags, and share links; admins also manage projects, keys, and people; owners also delete the organization. */
export const ROLE_GRANTS: Record<OrgRole, AccessGrant> = {
  viewer: READ,
  member: { ...READ, alert: ALL_DATA.alert, share: ALL_DATA.share, tag: ALL_DATA.tag },
  admin: { ...PEOPLE, ...ALL_DATA, organization: ["update"] },
  owner: { ...PEOPLE, ...ALL_DATA, organization: ["update", "delete"] },
};

export const isOrgRole = (v: unknown): v is OrgRole => typeof v === "string" && (ORG_ROLES as readonly string[]).includes(v);

/** True when `role` has every action in `grant`. */
export function roleAllows(role: OrgRole, grant: AccessGrant): boolean {
  const have = ROLE_GRANTS[role] as Record<string, readonly string[] | undefined>;
  return Object.entries(grant).every(([resource, actions]) => (actions ?? []).every((a) => have[resource]?.includes(a)));
}

/** Rank, for "may not give a role above your own". */
export const ROLE_RANK: Record<OrgRole, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };
