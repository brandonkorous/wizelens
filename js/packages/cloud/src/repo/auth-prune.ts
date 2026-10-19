import type { Queryable } from "../db/db.js";

/** Remove expired sessions, links, and OAuth rows, and sign-in counters older than a day. Better Auth ignores them already; this keeps the tables small. */
export async function pruneAuthRows(q: Queryable): Promise<void> {
  await q.query("DELETE FROM sessions WHERE expires_at < now()");
  await q.query("DELETE FROM verifications WHERE expires_at < now()");
  await q.query("DELETE FROM rate_limits WHERE last_request < $1", [Date.now() - 86_400_000]);
  await q.query("DELETE FROM invites WHERE status <> 'pending' AND created_at < now() - interval '90 days'");
  await pruneOAuthRows(q, Date.now());
}

/** Expired OAuth tokens, grants ended 90 days ago or never consented to, and registered apps nobody connected within a day. */
async function pruneOAuthRows(q: Queryable, now: number): Promise<void> {
  await q.query("DELETE FROM oauth_access_tokens WHERE expires_at < now() - interval '1 day'");
  await q.query("DELETE FROM oauth_refresh_tokens WHERE expires_at < now() - interval '1 day'");
  await q.query("DELETE FROM oauth_client_assertions WHERE expires_at < now()");
  await q.query("DELETE FROM oauth_grants WHERE revoked_ms < $1", [now - 90 * 86_400_000]);
  await q.query("DELETE FROM oauth_grants g WHERE g.created_ms < $1 AND NOT EXISTS (SELECT 1 FROM oauth_consents k WHERE k.reference_id = g.id)", [now - 86_400_000]);
  await q.query(
    `DELETE FROM oauth_clients c WHERE c.created_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = c.client_id)
      AND NOT EXISTS (SELECT 1 FROM oauth_refresh_tokens t WHERE t.client_id = c.client_id)`,
  );
}
