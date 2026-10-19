import { hashToken, newId, newToken } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

// SCIM bearer tokens: one identity provider connection per organization, each token shown once (only its hash is kept).

export interface ScimToken {
  id: string;
  name: string;
  prefix: string;
  createdMs: number;
  lastUsedMs: number | null;
}

const COLUMNS = `id, name, prefix, created_ms AS "createdMs", last_used_ms AS "lastUsedMs"`;

export async function createScimToken(q: Queryable, orgId: string, name: string, userId: string, now: number): Promise<{ token: string; item: ScimToken }> {
  const token = newToken("scim");
  const item: ScimToken = { id: newId(), name: name.trim().slice(0, 80) || "Identity provider", prefix: token.slice(0, 12), createdMs: now, lastUsedMs: null };
  await q.query("INSERT INTO scim_tokens (id, org_id, name, prefix, token_hash, created_by, created_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    item.id,
    orgId,
    item.name,
    item.prefix,
    hashToken(token),
    userId,
    now,
  ]);
  return { token, item };
}

export const listScimTokens = (q: Queryable, orgId: string): Promise<ScimToken[]> =>
  q.query<ScimToken>(`SELECT ${COLUMNS} FROM scim_tokens WHERE org_id = $1 AND revoked_ms IS NULL ORDER BY created_ms DESC`, [orgId]);

export async function revokeScimToken(q: Queryable, orgId: string, id: string, now: number): Promise<boolean> {
  return (await q.query("UPDATE scim_tokens SET revoked_ms = $1 WHERE id = $2 AND org_id = $3 AND revoked_ms IS NULL RETURNING id", [now, id, orgId])).length > 0;
}

/** The token's organization and id, or undefined. Marks it used at most once a minute. */
export async function scimTokenOf(q: Queryable, token: string, now: number): Promise<{ id: string; orgId: string } | undefined> {
  if (!token.startsWith("wl_sc_")) return undefined;
  const [row] = await q.query<{ id: string; org_id: string; last_used_ms: number | null }>(
    "SELECT id, org_id, last_used_ms FROM scim_tokens WHERE token_hash = $1 AND revoked_ms IS NULL",
    [hashToken(token)],
  );
  if (!row) return undefined;
  if (!row.last_used_ms || now - row.last_used_ms > 60_000) await q.query("UPDATE scim_tokens SET last_used_ms = $1 WHERE id = $2", [now, row.id]);
  return { id: row.id, orgId: row.org_id };
}
