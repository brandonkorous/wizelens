import { newId } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

/** How long a choice on the consent page waits for its consent. */
const PENDING_MS = 10 * 60_000;

/** What one person let one connected app (an OAuth client, such as Claude) read: one organization, all of it or some projects. */
export interface Grant {
  id: string;
  userId: string;
  orgId: string;
  clientId: string;
  /** Every project of the organization, also ones made later. */
  allProjects: boolean;
  projectIds: string[];
  createdMs: number;
  usedMs: number | null;
}

/** A grant with the app's name and the organization's, for the connected apps lists. */
export interface GrantView extends Grant {
  clientName: string | null;
  orgName: string;
  userEmail: string;
}

interface GrantRow {
  id: string;
  user_id: string;
  org_id: string;
  client_id: string;
  all_projects: boolean;
  project_ids: string;
  created_ms: number;
  used_ms: number | null;
}

const COLUMNS = "g.id, g.user_id, g.org_id, g.client_id, g.all_projects, g.project_ids, g.created_ms, g.used_ms";

const toGrant = (r: GrantRow): Grant => ({
  id: r.id,
  userId: r.user_id,
  orgId: r.org_id,
  clientId: r.client_id,
  allProjects: r.all_projects,
  projectIds: JSON.parse(r.project_ids) as string[],
  createdMs: r.created_ms,
  usedMs: r.used_ms,
});

/** A new grant from the consent page. Older grants of this person to this app end, with their tokens: the app holds only the newest. */
export async function createGrant(q: Queryable, g: Omit<Grant, "id" | "usedMs" | "createdMs">, sessionId: string, now: number): Promise<string> {
  const id = newId();
  const old = await q.query<{ id: string }>("SELECT id FROM oauth_grants WHERE user_id = $1 AND client_id = $2 AND revoked_ms IS NULL", [g.userId, g.clientId]);
  for (const o of old) await endGrant(q, o.id, now);
  await q.query(
    "INSERT INTO oauth_grants (id, user_id, org_id, client_id, session_id, all_projects, project_ids, created_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [id, g.userId, g.orgId, g.clientId, sessionId, g.allProjects, JSON.stringify(g.allProjects ? [] : g.projectIds), now],
  );
  return id;
}

/** The grant this session just chose on the consent page, for Better Auth to tie the consent to. */
export async function pendingGrantId(q: Queryable, sessionId: string, now: number): Promise<string | undefined> {
  const [row] = await q.query<{ id: string }>(
    "SELECT id FROM oauth_grants WHERE session_id = $1 AND created_ms > $2 AND revoked_ms IS NULL ORDER BY created_ms DESC LIMIT 1",
    [sessionId, now - PENDING_MS],
  );
  return row?.id;
}

/** An open grant by id. Marks it used (at most once a minute). */
export async function grantById(q: Queryable, id: string, now: number): Promise<Grant | undefined> {
  const [row] = await q.query<GrantRow>(`SELECT ${COLUMNS} FROM oauth_grants g WHERE g.id = $1 AND g.revoked_ms IS NULL`, [id]);
  if (!row) return undefined;
  if (!row.used_ms || now - row.used_ms > 60_000) await q.query("UPDATE oauth_grants SET used_ms = $1 WHERE id = $2", [now, id]);
  return toGrant(row);
}

/** End a grant: its tokens and consent go too, so the app must ask again. False when it was not open. */
export async function endGrant(q: Queryable, id: string, now: number): Promise<boolean> {
  const rows = await q.query("UPDATE oauth_grants SET revoked_ms = $1 WHERE id = $2 AND revoked_ms IS NULL RETURNING id", [now, id]);
  await q.query("DELETE FROM oauth_access_tokens WHERE reference_id = $1", [id]);
  await q.query("DELETE FROM oauth_refresh_tokens WHERE reference_id = $1", [id]);
  await q.query("DELETE FROM oauth_consents WHERE reference_id = $1", [id]);
  return rows.length > 0;
}

const VIEW = `SELECT ${COLUMNS}, c.name AS client_name, o.name AS org_name, u.email AS user_email
  FROM oauth_grants g JOIN oauth_clients c ON c.client_id = g.client_id JOIN orgs o ON o.id = g.org_id JOIN users u ON u.id = g.user_id`;

type ViewRow = GrantRow & { client_name: string | null; org_name: string; user_email: string };
const toView = (r: ViewRow): GrantView => ({ ...toGrant(r), clientName: r.client_name, orgName: r.org_name, userEmail: r.user_email });

/** Open grants the person gave consent for. */
const DONE = "g.revoked_ms IS NULL AND EXISTS (SELECT 1 FROM oauth_consents k WHERE k.reference_id = g.id)";

export async function grantsOfUser(q: Queryable, userId: string): Promise<GrantView[]> {
  return (await q.query<ViewRow>(`${VIEW} WHERE g.user_id = $1 AND ${DONE} ORDER BY g.created_ms DESC`, [userId])).map(toView);
}

export async function grantsOfOrg(q: Queryable, orgId: string): Promise<GrantView[]> {
  return (await q.query<ViewRow>(`${VIEW} WHERE g.org_id = $1 AND ${DONE} ORDER BY g.created_ms DESC`, [orgId])).map(toView);
}
