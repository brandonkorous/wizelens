import { newId } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

export interface AuditEntry {
  actor: string;
  action: string;
  detail: Record<string, unknown>;
  timeMs: number;
}

/** Keep one line of who did what. Every MCP call and every change to members, keys, and projects writes one. */
export async function audit(q: Queryable, orgId: string, actor: string, action: string, detail: Record<string, unknown>, now: number): Promise<void> {
  await q.query("INSERT INTO audit (id, org_id, actor, action, detail, time_ms) VALUES ($1, $2, $3, $4, $5, $6)", [
    newId(),
    orgId,
    actor,
    action,
    JSON.stringify(detail),
    now,
  ]);
}

export async function listAudit(q: Queryable, orgId: string, limit: number, before?: number): Promise<AuditEntry[]> {
  const rows = await q.query<{ actor: string; action: string; detail: string; time_ms: number }>(
    `SELECT actor, action, detail, time_ms FROM audit WHERE org_id = $1 AND time_ms < $2 ORDER BY time_ms DESC LIMIT $3`,
    [orgId, before ?? Number.MAX_SAFE_INTEGER, limit],
  );
  return rows.map((r) => ({ actor: r.actor, action: r.action, detail: JSON.parse(r.detail) as Record<string, unknown>, timeMs: r.time_ms }));
}
