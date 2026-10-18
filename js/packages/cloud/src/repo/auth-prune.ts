import type { Queryable } from "../db/db.js";

/** Remove expired sessions and links, and sign-in counters older than a day. Better Auth ignores them already; this keeps the tables small. */
export async function pruneAuthRows(q: Queryable): Promise<void> {
  await q.query("DELETE FROM sessions WHERE expires_at < now()");
  await q.query("DELETE FROM verifications WHERE expires_at < now()");
  await q.query("DELETE FROM rate_limits WHERE last_request < $1", [Date.now() - 86_400_000]);
  await q.query("DELETE FROM invites WHERE status <> 'pending' AND created_at < now() - interval '90 days'");
}
