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

export interface AuditFilter {
  /** Older than this time. */
  before?: number;
  /** At or after this time. */
  from?: number;
  /** An action ("key.create") or a group ("key."). */
  action?: string;
  /** "user:<id>", "key:<id>", or "system". */
  actor?: string;
}

const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The WHERE text and its args for one organization and the filter. */
function auditWhere(orgId: string, f: AuditFilter): { where: string; args: unknown[] } {
  const where = ["org_id = $1", "time_ms < $2"];
  const args: unknown[] = [orgId, f.before ?? Number.MAX_SAFE_INTEGER];
  if (f.from !== undefined) where.push(`time_ms >= $${args.push(f.from)}`);
  if (f.action) where.push(f.action.endsWith(".") ? `action LIKE $${args.push(`${like(f.action)}%`)}` : `action = $${args.push(f.action)}`);
  if (f.actor) where.push(`actor = $${args.push(f.actor)}`);
  return { where: where.join(" AND "), args };
}

/** Newest first, `limit` at most, `offset` rows in, with the filter. */
export async function listAudit(q: Queryable, orgId: string, limit: number, f: AuditFilter = {}, offset = 0): Promise<AuditEntry[]> {
  const { where, args } = auditWhere(orgId, f);
  const rows = await q.query<{ actor: string; action: string; detail: string; time_ms: number }>(
    `SELECT actor, action, detail, time_ms FROM audit WHERE ${where} ORDER BY time_ms DESC, id LIMIT $${args.push(limit)} OFFSET $${args.push(offset)}`,
    args,
  );
  return rows.map((r) => ({ actor: r.actor, action: r.action, detail: JSON.parse(r.detail) as Record<string, unknown>, timeMs: r.time_ms }));
}

/** How many lines match the filter. */
export async function countAudit(q: Queryable, orgId: string, f: AuditFilter = {}): Promise<number> {
  const { where, args } = auditWhere(orgId, f);
  const rows = await q.query<{ n: string | number }>(`SELECT COUNT(*) AS n FROM audit WHERE ${where}`, args);
  return Number(rows[0]?.n ?? 0);
}

/** The actions and actors an organization's log has, for the filter menus. */
export async function auditFacets(q: Queryable, orgId: string): Promise<{ actions: string[]; actors: string[] }> {
  const actions = await q.query<{ v: string }>("SELECT DISTINCT action AS v FROM audit WHERE org_id = $1 ORDER BY v", [orgId]);
  const actors = await q.query<{ v: string }>("SELECT DISTINCT actor AS v FROM audit WHERE org_id = $1 ORDER BY v", [orgId]);
  return { actions: actions.map((r) => r.v), actors: actors.map((r) => r.v) };
}

/** The filter from `before`, `from`, `action` ("key." for a group), and `actor`. */
export function auditFilterOf(p: URLSearchParams): AuditFilter {
  const num = (k: string) => Number(p.get(k)) || undefined;
  const text = (k: string) => p.get(k)?.trim().slice(0, 200) || undefined;
  return { before: num("before"), from: num("from"), action: text("action"), actor: text("actor") };
}
