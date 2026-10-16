import { hashToken, newId, newToken, slugOf } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
}

const COLUMNS = `id, org_id AS "orgId", name, slug`;

export async function createProject(q: Queryable, orgId: string, name: string, now: number): Promise<Project> {
  const base = slugOf(name);
  const taken = new Set((await q.query<{ slug: string }>("SELECT slug FROM projects WHERE org_id = $1", [orgId])).map((r) => r.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  const p = { id: newId(), orgId, name: name.trim().slice(0, 100) || slug, slug };
  await q.query("INSERT INTO projects (id, org_id, name, slug, created_ms) VALUES ($1, $2, $3, $4, $5)", [p.id, orgId, p.name, slug, now]);
  return p;
}

export const listProjects = (q: Queryable, orgId: string): Promise<Project[]> =>
  q.query<Project>(`SELECT ${COLUMNS} FROM projects WHERE org_id = $1 ORDER BY name`, [orgId]);

export async function projectInOrg(q: Queryable, orgId: string, projectId: string): Promise<Project | undefined> {
  const [row] = await q.query<Project>(`SELECT ${COLUMNS} FROM projects WHERE org_id = $1 AND id = $2`, [orgId, projectId]);
  return row;
}

/** Delete a project and all of its data. */
export async function deleteProject(q: Queryable, projectId: string): Promise<void> {
  await deleteProjectData(q, projectId);
  await q.query("DELETE FROM api_keys WHERE project_ids = $1", [JSON.stringify([projectId])]);
  await q.query("DELETE FROM projects WHERE id = $1", [projectId]);
}

/** Delete every trace, span, log, and service of a project. The project and its settings stay. */
export async function deleteProjectData(q: Queryable, projectId: string): Promise<void> {
  for (const table of ["spans", "logs", "traces", "services", "metric_points"]) await q.query(`DELETE FROM ${table} WHERE project_id = $1`, [projectId]);
}

export type KeyKind = "ingest" | "read";

export interface ApiKey {
  id: string;
  kind: KeyKind;
  name: string;
  prefix: string;
  /** Ingest keys: exactly one project. Read keys: the projects they may read. */
  projectIds: string[];
  createdMs: number;
  lastUsedMs: number | null;
}

interface KeyRow extends Omit<ApiKey, "projectIds"> {
  project_ids: string;
  org_id: string;
}

const KEY_COLUMNS = `id, org_id, kind, name, prefix, project_ids, created_ms AS "createdMs", last_used_ms AS "lastUsedMs"`;
const toKey = ({ project_ids, org_id: _org, ...k }: KeyRow): ApiKey => ({ ...k, projectIds: JSON.parse(project_ids) as string[] });

/** A new key. Returns the secret once; only its hash is kept. */
export async function createKey(q: Queryable, orgId: string, kind: KeyKind, name: string, projectIds: string[], by: string, now: number) {
  const token = newToken(kind);
  const id = newId();
  await q.query(
    `INSERT INTO api_keys (id, org_id, kind, project_ids, name, prefix, token_hash, created_by, created_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, orgId, kind, JSON.stringify(projectIds), name.trim().slice(0, 100) || kind, token.slice(0, 12), hashToken(token), by, now],
  );
  return { id, token };
}

export async function listKeys(q: Queryable, orgId: string): Promise<ApiKey[]> {
  const rows = await q.query<KeyRow>(`SELECT ${KEY_COLUMNS} FROM api_keys WHERE org_id = $1 AND revoked_ms IS NULL ORDER BY created_ms DESC`, [orgId]);
  return rows.map(toKey);
}

export async function revokeKey(q: Queryable, orgId: string, keyId: string, now: number): Promise<boolean> {
  const rows = await q.query("UPDATE api_keys SET revoked_ms = $1 WHERE org_id = $2 AND id = $3 AND revoked_ms IS NULL RETURNING id", [now, orgId, keyId]);
  return rows.length > 0;
}

/** The key for a secret, when it is valid. Marks it used (at most once a minute). */
export async function keyByToken(q: Queryable, token: string, now: number): Promise<(ApiKey & { orgId: string }) | undefined> {
  const [row] = await q.query<KeyRow>(`SELECT ${KEY_COLUMNS} FROM api_keys WHERE token_hash = $1 AND revoked_ms IS NULL`, [hashToken(token)]);
  if (!row) return undefined;
  if (!row.lastUsedMs || now - row.lastUsedMs > 60_000) await q.query("UPDATE api_keys SET last_used_ms = $1 WHERE id = $2", [now, row.id]);
  return { ...toKey(row), orgId: row.org_id };
}
