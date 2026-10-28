// A secret key (ingest or read) that a public page sent with: refused, and kept in the audit log so its owners are told.
import type { Queryable } from "../db/db.js";
import { audit } from "./audit.js";

const HOUR_MS = 3_600_000;

export interface Exposed {
  origin: string | null;
  timeMs: number;
}

/** Note that a page on `origin` sent with this secret key: one audit line an hour per key, so a busy site does not flood it. */
export async function noteExposed(q: Queryable, key: { id: string; orgId: string; name: string; kind: string }, origin: string | undefined, now: number): Promise<void> {
  const [seen] = await q.query("SELECT 1 FROM audit WHERE org_id = $1 AND action = 'key.exposed' AND detail::jsonb->>'keyId' = $2 AND time_ms > $3 LIMIT 1", [key.orgId, key.id, now - HOUR_MS]);
  if (!seen) await audit(q, key.orgId, "system", "key.exposed", { keyId: key.id, name: key.name, kind: key.kind, origin: origin ?? null }, now);
}

/** The last time each key of the organization was seen in a page, by key id. */
export async function exposedKeys(q: Queryable, orgId: string): Promise<Map<string, Exposed>> {
  const rows = await q.query<{ detail: string; time_ms: number }>("SELECT detail, time_ms FROM audit WHERE org_id = $1 AND action = 'key.exposed' ORDER BY time_ms", [orgId]);
  const out = new Map<string, Exposed>();
  for (const r of rows) {
    const d = JSON.parse(r.detail) as { keyId?: string; origin?: string | null };
    if (d.keyId) out.set(d.keyId, { origin: d.origin ?? null, timeMs: Number(r.time_ms) });
  }
  return out;
}
