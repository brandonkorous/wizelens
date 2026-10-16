import { hashToken, newId, newToken, slugOf } from "../auth/crypto.js";
import type { Role } from "../auth/roles.js";
import type { Queryable } from "../db/db.js";
import { normalizeEmail } from "./users.js";

export interface Org {
  id: string;
  name: string;
  slug: string;
  retentionDays: number;
}

export interface Membership extends Org {
  role: Role;
}

export interface Member {
  userId: string;
  email: string;
  name: string;
  role: Role;
  sinceMs: number;
}

const INVITE_MS = 7 * 24 * 60 * 60_000;
const ORG_COLUMNS = "o.id, o.name, o.slug, o.retention_days AS \"retentionDays\"";

async function freeSlug(q: Queryable, name: string): Promise<string> {
  const base = slugOf(name);
  const taken = new Set((await q.query<{ slug: string }>("SELECT slug FROM orgs WHERE slug LIKE $1", [`${base}%`])).map((r) => r.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** A new organization with `ownerId` as its owner. */
export async function createOrg(q: Queryable, name: string, ownerId: string, now: number, retentionDays = 30): Promise<Org> {
  const org = { id: newId(), name: name.trim().slice(0, 100) || "My organization", slug: await freeSlug(q, name), retentionDays };
  await q.query("INSERT INTO orgs (id, name, slug, retention_days, created_ms) VALUES ($1, $2, $3, $4, $5)", [org.id, org.name, org.slug, retentionDays, now]);
  await q.query("INSERT INTO members (org_id, user_id, role, created_ms) VALUES ($1, $2, 'owner', $3)", [org.id, ownerId, now]);
  return org;
}

export const orgsOfUser = (q: Queryable, userId: string): Promise<Membership[]> =>
  q.query<Membership>(`SELECT ${ORG_COLUMNS}, m.role FROM members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 ORDER BY o.name`, [userId]);

export async function membership(q: Queryable, userId: string, orgId: string): Promise<Membership | undefined> {
  const [row] = await q.query<Membership>(`SELECT ${ORG_COLUMNS}, m.role FROM members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 AND m.org_id = $2`, [
    userId,
    orgId,
  ]);
  return row;
}

export async function updateOrg(q: Queryable, orgId: string, change: { name?: string; retentionDays?: number }): Promise<void> {
  if (change.name !== undefined) await q.query("UPDATE orgs SET name = $1 WHERE id = $2", [change.name.trim().slice(0, 100), orgId]);
  if (change.retentionDays !== undefined) await q.query("UPDATE orgs SET retention_days = $1 WHERE id = $2", [change.retentionDays, orgId]);
}

export const listMembers = (q: Queryable, orgId: string): Promise<Member[]> =>
  q.query<Member>(
    `SELECT u.id AS "userId", u.email, u.name, m.role, m.created_ms AS "sinceMs" FROM members m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 ORDER BY u.name`,
    [orgId],
  );

export async function setRole(q: Queryable, orgId: string, userId: string, role: Role): Promise<void> {
  await q.query("UPDATE members SET role = $1 WHERE org_id = $2 AND user_id = $3", [role, orgId, userId]);
}

export async function removeMember(q: Queryable, orgId: string, userId: string): Promise<void> {
  await q.query("DELETE FROM members WHERE org_id = $1 AND user_id = $2", [orgId, userId]);
}

export async function ownerCount(q: Queryable, orgId: string): Promise<number> {
  const [row] = await q.query<{ n: number }>("SELECT count(*)::int AS n FROM members WHERE org_id = $1 AND role = 'owner'", [orgId]);
  return row?.n ?? 0;
}

/** A new invite link token for one email address. Valid for 7 days. */
export async function createInvite(q: Queryable, orgId: string, email: string, role: Role, by: string, now: number): Promise<string> {
  const token = newToken("invite");
  await q.query("INSERT INTO invites (token_hash, org_id, email, role, created_by, created_ms, expires_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    hashToken(token),
    orgId,
    normalizeEmail(email),
    role,
    by,
    now,
    now + INVITE_MS,
  ]);
  return token;
}

export interface Invite {
  orgId: string;
  orgName: string;
  email: string;
  role: Role;
}

export async function openInvite(q: Queryable, token: string, now: number): Promise<Invite | undefined> {
  const [row] = await q.query<Invite>(
    `SELECT i.org_id AS "orgId", o.name AS "orgName", i.email, i.role FROM invites i JOIN orgs o ON o.id = i.org_id
     WHERE i.token_hash = $1 AND i.accepted_ms IS NULL AND i.expires_ms > $2`,
    [hashToken(token), now],
  );
  return row;
}

/** Join the organization of an open invite. The invite then cannot be used again. */
export async function acceptInvite(q: Queryable, token: string, userId: string, now: number): Promise<Invite | undefined> {
  const invite = await openInvite(q, token, now);
  if (!invite) return undefined;
  await q.query("UPDATE invites SET accepted_ms = $1 WHERE token_hash = $2", [now, hashToken(token)]);
  await q.query("INSERT INTO members (org_id, user_id, role, created_ms) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [invite.orgId, userId, invite.role, now]);
  return invite;
}

export const pendingInvites = (q: Queryable, orgId: string, now: number) =>
  q.query<{ email: string; role: Role; expiresMs: number }>(
    `SELECT email, role, expires_ms AS "expiresMs" FROM invites WHERE org_id = $1 AND accepted_ms IS NULL AND expires_ms > $2 ORDER BY created_ms DESC`,
    [orgId, now],
  );
