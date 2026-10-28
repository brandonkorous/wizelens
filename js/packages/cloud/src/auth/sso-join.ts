// Single sign-on adds new people to the provider's organization, but never someone an owner or admin removed, until they are invited again.
import { randomUUID } from "node:crypto";
import type { Queryable } from "../db/db.js";
import { audit } from "../repo/audit.js";

interface SsoUser {
  id: string;
  email: string;
}

/** Remember that a person was taken out of an organization, so the next sign-on does not put them back. */
export async function noteRemoved(q: Queryable, orgId: string, email: string, now: number): Promise<void> {
  await q.query(
    "INSERT INTO sso_removed (org_id, user_id, removed_ms) SELECT $1, id, $3 FROM users WHERE lower(email) = lower($2) ON CONFLICT (org_id, user_id) DO UPDATE SET removed_ms = EXCLUDED.removed_ms",
    [orgId, email, now],
  );
}

/** An invite or an added member undoes the removal. */
export async function clearRemoved(q: Queryable, orgId: string, userId: string): Promise<void> {
  await q.query("DELETE FROM sso_removed WHERE org_id = $1 AND user_id = $2", [orgId, userId]);
}

/** On every sign-on: join the organization as a member, unless already in, invited (the invite adds them), or removed. */
export async function joinViaSso(q: Queryable, orgId: string | null | undefined, providerId: string, user: SsoUser, now: number): Promise<void> {
  if (!orgId) return;
  const [row] = await q.query<{ member: boolean; invited: boolean; removed: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM members WHERE org_id = $1 AND user_id = $2) AS member,
            EXISTS (SELECT 1 FROM invites WHERE org_id = $1 AND lower(email) = lower($3) AND status = 'pending' AND expires_at > now()) AS invited,
            EXISTS (SELECT 1 FROM sso_removed WHERE org_id = $1 AND user_id = $2) AS removed`,
    [orgId, user.id, user.email],
  );
  if (!row || row.member || row.invited) return;
  if (row.removed) return audit(q, orgId, `user:${user.id}`, "sso.join_refused", { via: "sso", providerId, email: user.email }, now);
  await q.query("INSERT INTO members (id, org_id, user_id, role, created_at) VALUES ($1, $2, $3, 'member', now()) ON CONFLICT (org_id, user_id) DO NOTHING", [randomUUID(), orgId, user.id]);
  await audit(q, orgId, `user:${user.id}`, "member.join", { via: "sso", providerId }, now);
}
