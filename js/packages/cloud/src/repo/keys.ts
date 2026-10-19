// API keys: ingest keys send one project's data, read keys read some projects. Optional expiry, scopes, and rotation with a grace period.
import { hashToken, newId, newToken } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

export type KeyKind = "ingest" | "read";
export const INGEST_SCOPES = ["traces", "logs", "metrics"] as const;
export const READ_SCOPES = ["api", "mcp"] as const;
export type IngestScope = (typeof INGEST_SCOPES)[number];
export type ReadScope = (typeof READ_SCOPES)[number];
export type KeyScope = IngestScope | ReadScope;

export interface ApiKey {
  id: string;
  kind: KeyKind;
  name: string;
  prefix: string;
  /** Ingest keys: exactly one project. Read keys: the projects they may read. */
  projectIds: string[];
  /** What the key may do; null for everything its kind allows. */
  scopes: KeyScope[] | null;
  createdMs: number;
  lastUsedMs: number | null;
  /** The key stops working at this time; null for never. */
  expiresMs: number | null;
  /** The key this one replaced. */
  rotatedFrom: string | null;
}

interface KeyRow extends Omit<ApiKey, "projectIds" | "scopes"> {
  project_ids: string;
  scopes: string | null;
  org_id: string;
}

const KEY_COLUMNS = `id, org_id, kind, name, prefix, project_ids, scopes, created_ms AS "createdMs", last_used_ms AS "lastUsedMs", expires_ms AS "expiresMs", rotated_from AS "rotatedFrom"`;
const toKey = ({ project_ids, scopes, org_id: _org, ...k }: KeyRow): ApiKey => ({ ...k, projectIds: JSON.parse(project_ids) as string[], scopes: scopes ? (JSON.parse(scopes) as KeyScope[]) : null });

export const keyAllows = (key: Pick<ApiKey, "scopes">, scope: KeyScope): boolean => !key.scopes || key.scopes.includes(scope);

/** Checked scopes for a kind: null (all) when none or all are picked. Throws a message for people on a bad one. */
export function scopesFor(kind: KeyKind, raw: unknown): KeyScope[] | null {
  if (raw === undefined || raw === null) return null;
  const all: readonly string[] = kind === "ingest" ? INGEST_SCOPES : READ_SCOPES;
  if (!Array.isArray(raw) || raw.some((s) => !all.includes(s as string))) throw new Error(`Scopes for a ${kind} key are: ${all.join(", ")}.`);
  const picked = all.filter((s) => raw.includes(s)) as KeyScope[];
  if (!picked.length) throw new Error("Pick at least one scope.");
  return picked.length === all.length ? null : picked;
}

export interface KeyExtras {
  scopes?: KeyScope[] | null;
  expiresMs?: number | null;
  rotatedFrom?: string;
}

/** A new key. Returns the secret once; only its hash is kept. */
export async function createKey(q: Queryable, orgId: string, kind: KeyKind, name: string, projectIds: string[], by: string, now: number, x: KeyExtras = {}) {
  const token = newToken(kind);
  const id = newId();
  await q.query(
    `INSERT INTO api_keys (id, org_id, kind, project_ids, name, prefix, token_hash, created_by, created_ms, scopes, expires_ms, rotated_from)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, orgId, kind, JSON.stringify(projectIds), name.trim().slice(0, 100) || kind, token.slice(0, 12), hashToken(token), by, now, x.scopes ? JSON.stringify(x.scopes) : null, x.expiresMs ?? null, x.rotatedFrom ?? null],
  );
  return { id, token };
}

/** Keys not revoked, newest first; expired ones too, so people see them and clean up. */
export async function listKeys(q: Queryable, orgId: string): Promise<ApiKey[]> {
  const rows = await q.query<KeyRow>(`SELECT ${KEY_COLUMNS} FROM api_keys WHERE org_id = $1 AND revoked_ms IS NULL ORDER BY created_ms DESC`, [orgId]);
  return rows.map(toKey);
}

export async function keyInOrg(q: Queryable, orgId: string, keyId: string): Promise<ApiKey | undefined> {
  const [row] = await q.query<KeyRow>(`SELECT ${KEY_COLUMNS} FROM api_keys WHERE org_id = $1 AND id = $2 AND revoked_ms IS NULL`, [orgId, keyId]);
  return row && toKey(row);
}

export async function revokeKey(q: Queryable, orgId: string, keyId: string, now: number): Promise<boolean> {
  const rows = await q.query("UPDATE api_keys SET revoked_ms = $1 WHERE org_id = $2 AND id = $3 AND revoked_ms IS NULL RETURNING id", [now, orgId, keyId]);
  return rows.length > 0;
}

/** A new secret with the same name, kind, projects, scopes, and lifetime. The old one keeps working for `graceMs`, so apps can switch. */
export async function rotateKey(q: Queryable, orgId: string, old: ApiKey, by: string, now: number, graceMs: number) {
  const life = old.expiresMs === null ? null : old.expiresMs - old.createdMs;
  const key = await createKey(q, orgId, old.kind, old.name, old.projectIds, by, now, { scopes: old.scopes, expiresMs: life === null ? null : now + life, rotatedFrom: old.id });
  const until = Math.min(old.expiresMs ?? Infinity, now + graceMs);
  await q.query("UPDATE api_keys SET expires_ms = $1 WHERE id = $2", [until, old.id]);
  return { ...key, oldExpiresMs: until };
}

/** The key for a secret, when it is valid and not expired. Marks it used (at most once a minute). */
export async function keyByToken(q: Queryable, token: string, now: number): Promise<(ApiKey & { orgId: string }) | undefined> {
  const [row] = await q.query<KeyRow>(`SELECT ${KEY_COLUMNS} FROM api_keys WHERE token_hash = $1 AND revoked_ms IS NULL AND (expires_ms IS NULL OR expires_ms > $2)`, [hashToken(token), now]);
  if (!row) return undefined;
  if (!row.lastUsedMs || now - row.lastUsedMs > 60_000) await q.query("UPDATE api_keys SET last_used_ms = $1 WHERE id = $2", [now, row.id]);
  return { ...toKey(row), orgId: row.org_id };
}
