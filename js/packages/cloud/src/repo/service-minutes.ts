// The minutes each service sent anything: a gap is time it could not send (stopped, or its key refused), not a quiet time.
import type { Queryable } from "../db/db.js";
import { KEEP_DAYS } from "./settings.js";

const MINUTE_MS = 60_000;
/** Two or more minutes with nothing: SDKs send a heartbeat every 10 s, so one late minute is not a gap. */
export const GAP_MS = 2 * MINUTE_MS;

/** A time a service sent nothing; `endMs` is null while it still sends nothing. */
export interface SendGap {
  startMs: number;
  endMs: number | null;
}

/** The minute last written per sender by this process: one insert a minute, not one per batch. */
const written = new Map<string, number>();

/** Note that a service sent something (a batch or a heartbeat) in this minute. */
export async function noteMinute(q: Queryable, projectId: string, service: string, env: string, now: number): Promise<void> {
  const minute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const key = `${projectId}\u001f${service}\u001f${env}`;
  if (written.get(key) === minute) return;
  await q.query("INSERT INTO service_minutes (project_id, service, environment, minute_ms) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [projectId, service, env, minute]);
  written.set(key, minute);
}

/** Minutes the service was seen in from–to, plus the last one before `from`, so a gap that began earlier still shows. */
const MINUTES_SQL = `
  SELECT DISTINCT minute_ms AS m FROM service_minutes WHERE project_id = $1 AND service = $2 AND ($5::text IS NULL OR environment = $5) AND minute_ms <= $4
    AND minute_ms >= COALESCE((SELECT MAX(minute_ms) FROM service_minutes WHERE project_id = $1 AND service = $2 AND ($5::text IS NULL OR environment = $5) AND minute_ms < $3), $3)
  ORDER BY m`;

/** Times the service sent nothing for two minutes or more within from–to, oldest first; none before it was first seen. */
export async function sendGaps(q: Queryable, projectId: string, service: string, range: { fromMs: number; toMs: number; env: string | null }, now: number): Promise<SendGap[]> {
  const minutes = (await q.query<{ m: number }>(MINUTES_SQL, [projectId, service, range.fromMs, range.toMs, range.env])).map((r) => Number(r.m));
  const gaps: SendGap[] = [];
  for (let i = 1; i < minutes.length; i++) {
    if (minutes[i]! - minutes[i - 1]! > GAP_MS) gaps.push({ startMs: minutes[i - 1]! + MINUTE_MS, endMs: minutes[i]! });
  }
  const last = minutes[minutes.length - 1];
  if (last !== undefined && Math.min(now, range.toMs) - (last + MINUTE_MS) >= GAP_MS) gaps.push({ startMs: last + MINUTE_MS, endMs: range.toMs >= now ? null : range.toMs });
  return gaps.filter((g) => (g.endMs ?? now) > range.fromMs);
}

/** Drop minutes past each project's retention, like the traces they stand beside. Returns how many. */
export async function pruneServiceMinutes(q: Queryable, now: number): Promise<number> {
  const sql = `DELETE FROM service_minutes m USING projects p, orgs o WHERE p.id = m.project_id AND o.id = p.org_id AND m.minute_ms < $1 - ${KEEP_DAYS} * 86400000.0 RETURNING 1`;
  return (await q.query(sql, [now])).length;
}
