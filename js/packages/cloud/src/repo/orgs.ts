import { slugOf } from "../auth/crypto.js";
import type { Role } from "../auth/roles.js";
import type { Queryable } from "../db/db.js";
import { deleteProjectData } from "./projects.js";

// Organizations, members, and invites are Better Auth's (auth/plugins.ts). These are the reads our routes need, plus retention and deletion.

export interface Org {
  id: string;
  name: string;
  slug: string;
  retentionDays: number;
  /** The plan column; "unlimited" is what applies while billing is off (routes/me.ts). */
  plan: string;
}

export interface Membership extends Org {
  role: Role;
}

export interface Member {
  /** The membership id Better Auth uses to change a role. */
  memberId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  sinceMs: number;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  expiresMs: number;
}

const ORG_COLUMNS = `o.id, o.name, o.slug, o.retention_days AS "retentionDays", o.plan`;
const ms = (column: string) => `(extract(epoch FROM ${column}) * 1000)::double precision`;

/** A slug no organization has yet, from the name. */
export async function freeSlug(q: Queryable, name: string): Promise<string> {
  const base = slugOf(name);
  const taken = new Set((await q.query<{ slug: string }>("SELECT slug FROM orgs WHERE slug LIKE $1", [`${base}%`])).map((r) => r.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

export const orgsOfUser = (q: Queryable, userId: string): Promise<Membership[]> =>
  q.query<Membership>(`SELECT ${ORG_COLUMNS}, m.role FROM members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 ORDER BY o.name`, [userId]);

export async function membership(q: Queryable, userId: string, orgId: string): Promise<Membership | undefined> {
  const [row] = await q.query<Membership>(`SELECT ${ORG_COLUMNS}, m.role FROM members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 AND m.org_id = $2`, [userId, orgId]);
  return row;
}

export async function setRetention(q: Queryable, orgId: string, retentionDays: number): Promise<void> {
  await q.query("UPDATE orgs SET retention_days = $1 WHERE id = $2", [retentionDays, orgId]);
}

export const listMembers = (q: Queryable, orgId: string): Promise<Member[]> =>
  q.query<Member>(
    `SELECT m.id AS "memberId", u.id AS "userId", u.email, u.name, m.role, ${ms("m.created_at")} AS "sinceMs" FROM members m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 ORDER BY u.name`,
    [orgId],
  );

/** Open invites. Their ids are the secret part of the link, so only managers see them. */
export const pendingInvites = (q: Queryable, orgId: string): Promise<PendingInvite[]> =>
  q.query<PendingInvite>(
    `SELECT id, email, role, ${ms("expires_at")} AS "expiresMs" FROM invites WHERE org_id = $1 AND status = 'pending' AND expires_at > now() ORDER BY created_at DESC`,
    [orgId],
  );

/** Delete an organization: every project's data first, then the row (members, invites, projects, keys, alerts, and shares go with it). */
export async function deleteOrgEverything(q: Queryable, orgId: string): Promise<void> {
  for (const { id } of await q.query<{ id: string }>("SELECT id FROM projects WHERE org_id = $1", [orgId])) await deleteProjectData(q, id);
  await q.query("DELETE FROM audit WHERE org_id = $1", [orgId]);
  await q.query("DELETE FROM subscriptions WHERE reference_id = $1", [orgId]);
  // SCIM rows carry the organization as their provisioning domain (auth/scim.ts); group members and grants go with them.
  for (const t of ["scim_groups", "scim_users", "scim_identity_tombstones", "scim_connection_bindings"]) await q.query(`DELETE FROM ${t} WHERE provisioning_domain_id = $1`, [orgId]);
  await q.query("DELETE FROM orgs WHERE id = $1", [orgId]);
}
