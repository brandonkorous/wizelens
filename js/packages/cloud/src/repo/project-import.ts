// Many projects at once, each with a new sending key: a name already in the organization gets a key, not a second project.
import type { ImportKind } from "@wizeworks/lens-core/internal";
import { hashToken, newId, newToken, slugOf } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";
import { insertMany } from "./trace-write.js";

/** One checked row: sites are already normalized for a browser key. */
export interface ImportRow {
  name: string;
  kind: ImportKind;
  keyName: string;
  origins: string[] | null;
}

/** What one row made. The secret is here once; only its hash is kept. */
export interface ImportedKey {
  projectId: string;
  projectName: string;
  slug: string;
  newProject: boolean;
  keyId: string;
  kind: ImportKind;
  keyName: string;
  prefix: string;
  token: string;
  origins: string[] | null;
}

interface Found {
  id: string;
  name: string;
  slug: string;
}

/** The project for a name: the organization's (first by creation) or a new one with a free slug. */
function projectFor(name: string, byName: Map<string, Found>, taken: Set<string>, made: Found[]): [Found, boolean] {
  const known = byName.get(name.toLowerCase());
  if (known) return [known, false];
  const base = slugOf(name);
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  const p = { id: newId(), name, slug };
  taken.add(slug);
  byName.set(name.toLowerCase(), p);
  made.push(p);
  return [p, true];
}

/** Make the projects and keys of `rows` in one go. Run it in a transaction so a failure makes none. */
export async function importProjects(q: Queryable, orgId: string, rows: ImportRow[], by: string, now: number, expiresMs: number | null): Promise<ImportedKey[]> {
  const existing = await q.query<Found>("SELECT id, name, slug FROM projects WHERE org_id = $1 ORDER BY created_ms DESC", [orgId]);
  const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));
  const taken = new Set(existing.map((p) => p.slug));
  const made: Found[] = [];
  const out = rows.map((r): ImportedKey => {
    const [p, newProject] = projectFor(r.name, byName, taken, made);
    const token = newToken(r.kind);
    return { projectId: p.id, projectName: p.name, slug: p.slug, newProject, keyId: newId(), kind: r.kind, keyName: r.keyName, prefix: token.slice(0, 12), token, origins: r.origins };
  });
  await insertMany(q, "INSERT INTO projects (id, org_id, name, slug, created_ms)", made.map((p) => [p.id, orgId, p.name, p.slug, now]), "");
  const keys = out.map((k) => [k.keyId, orgId, k.kind, JSON.stringify([k.projectId]), k.keyName, k.prefix, hashToken(k.token), by, now, expiresMs, k.origins ? JSON.stringify(k.origins) : null]);
  await insertMany(q, "INSERT INTO api_keys (id, org_id, kind, project_ids, name, prefix, token_hash, created_by, created_ms, expires_ms, origins)", keys, "");
  return out;
}
