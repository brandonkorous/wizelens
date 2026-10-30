// Saved views, searches, and dashboards per project, or for the whole organization. A person sees their own items and the shared ones.
import type { SavedInput, SavedItem } from "@wizeworks/lens-core/internal";
import { newId } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

interface Row {
  id: string;
  projectId: string;
  kind: SavedItem["kind"];
  name: string;
  shared: boolean;
  body: string;
  owner: string;
  ownerName: string | null;
  createdMs: number;
  updatedMs: number;
}

const SELECT = `SELECT s.id, COALESCE(s.project_id, '') AS "projectId", s.kind, s.name, s.shared, s.body, s.owner_id AS "owner", u.name AS "ownerName",
  s.created_ms AS "createdMs", s.updated_ms AS "updatedMs" FROM saved_items s LEFT JOIN users u ON u.id = s.owner_id`;

const itemOf = ({ body, ...r }: Row): SavedItem => {
  const b = JSON.parse(body) as Partial<Pick<SavedItem, "href" | "panels" | "chart">>;
  return { ...r, href: b.href ?? "", panels: b.panels ?? [], chart: b.chart === true, ownerName: r.ownerName ?? "", createdMs: Number(r.createdMs), updatedMs: Number(r.updatedMs) };
};

const bodyOf = (i: SavedInput) => JSON.stringify({ href: i.href, panels: i.panels, chart: i.chart });

/** Items a viewer sees: their own and the shared ones (`userId` null: shared only, for read keys). */
export async function listSaved(q: Queryable, projectId: string, userId: string | null): Promise<SavedItem[]> {
  const rows = await q.query<Row>(`${SELECT} WHERE s.project_id = $1 AND (s.shared OR s.owner_id = $2) ORDER BY s.created_ms`, [projectId, userId ?? ""]);
  return rows.map(itemOf);
}

export async function savedById(q: Queryable, projectId: string, id: string): Promise<SavedItem | undefined> {
  const [row] = await q.query<Row>(`${SELECT} WHERE s.project_id = $1 AND s.id = $2`, [projectId, id]);
  return row && itemOf(row);
}

export async function createSaved(q: Queryable, projectId: string, ownerId: string, i: SavedInput, now: number): Promise<string> {
  const id = newId();
  await q.query(
    `INSERT INTO saved_items (id, project_id, org_id, owner_id, kind, name, shared, body, created_ms, updated_ms)
     SELECT $1, $2, p.org_id, $3, $4, $5, $6, $7, $8, $8 FROM projects p WHERE p.id = $2`,
    [id, projectId, ownerId, i.kind, i.name, i.shared, bodyOf(i), now],
  );
  return id;
}

/** Items a viewer sees under "All projects": the organization's own and those of `projectIds` (the ones they may read). */
export async function listOrgSaved(q: Queryable, orgId: string, projectIds: readonly string[], userId: string | null): Promise<SavedItem[]> {
  const where = "s.org_id = $1 AND (s.project_id IS NULL OR s.project_id = ANY($2)) AND (s.shared OR s.owner_id = $3)";
  return (await q.query<Row>(`${SELECT} WHERE ${where} ORDER BY s.created_ms`, [orgId, [...projectIds], userId ?? ""])).map(itemOf);
}

/** One item of the whole organization (no project). */
export async function orgSavedById(q: Queryable, orgId: string, id: string): Promise<SavedItem | undefined> {
  const [row] = await q.query<Row>(`${SELECT} WHERE s.org_id = $1 AND s.project_id IS NULL AND s.id = $2`, [orgId, id]);
  return row && itemOf(row);
}

export async function createOrgSaved(q: Queryable, orgId: string, ownerId: string, i: SavedInput, now: number): Promise<string> {
  const id = newId();
  await q.query(
    "INSERT INTO saved_items (id, org_id, owner_id, kind, name, shared, body, created_ms, updated_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)",
    [id, orgId, ownerId, i.kind, i.name, i.shared, bodyOf(i), now],
  );
  return id;
}

export async function updateSaved(q: Queryable, id: string, i: SavedInput, now: number): Promise<void> {
  await q.query("UPDATE saved_items SET name = $2, shared = $3, body = $4, updated_ms = $5 WHERE id = $1", [id, i.name, i.shared, bodyOf(i), now]);
}

export async function deleteSaved(q: Queryable, id: string): Promise<void> {
  await q.query("DELETE FROM saved_items WHERE id = $1", [id]);
}
