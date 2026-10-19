import { changeOf, lastRunOf, nextRunMs, UPTIME_KEEP_MS, type UptimeCheck, type UptimeCheckInput, type UptimeIncident, type UptimeResult } from "@wizeworks/lens-core";
import { newId } from "../auth/crypto.js";
import type { AuthSecret } from "../auth/secret.js";
import type { Queryable } from "../db/db.js";
import { openHeaders, sealHeaders } from "../uptime/headers.js";

export type CloudCheck = UptimeCheck & { projectId: string };

const COLUMNS = `id, project_id AS "projectId", name, url, method, headers, expect_status AS "expectStatus", expect_body AS "expectBody",
  interval_min AS "intervalMin", timeout_ms AS "timeoutMs", env, enabled, created_ms AS "createdMs", state, last_run_ms AS "lastRunMs",
  last_duration_ms AS "lastDurationMs", last_status AS "lastStatus", last_error AS "lastError", tls_expires_ms AS "tlsExpiresMs"`;

type Row = Omit<CloudCheck, "headers"> & { headers: string };
const toChecks = (secrets: readonly AuthSecret[], rows: Row[]): Promise<CloudCheck[]> => Promise.all(rows.map(async (r) => ({ ...r, headers: await openHeaders(secrets, r.headers) })));

export const listChecks = async (q: Queryable, secrets: readonly AuthSecret[], projectId: string): Promise<CloudCheck[]> =>
  toChecks(secrets, await q.query<Row>(`SELECT ${COLUMNS} FROM uptime_checks WHERE project_id = $1 ORDER BY name, id`, [projectId]));

export async function checkById(q: Queryable, secrets: readonly AuthSecret[], projectId: string, id: string): Promise<CloudCheck | undefined> {
  return (await toChecks(secrets, await q.query<Row>(`SELECT ${COLUMNS} FROM uptime_checks WHERE project_id = $1 AND id = $2`, [projectId, id])))[0];
}

export const countChecks = async (q: Queryable, projectId: string): Promise<number> =>
  Number((await q.query<{ n: string }>("SELECT count(*) AS n FROM uptime_checks WHERE project_id = $1", [projectId]))[0]?.n ?? 0);

export async function createCheck(q: Queryable, secrets: readonly AuthSecret[], projectId: string, c: UptimeCheckInput, by: string, now: number): Promise<string> {
  const id = newId();
  await q.query(
    `INSERT INTO uptime_checks (id, project_id, name, url, method, headers, expect_status, expect_body, interval_min, timeout_ms, env, enabled, created_by, created_ms, next_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
    [id, projectId, c.name, c.url, c.method, await sealHeaders(secrets, c.headers), c.expectStatus, c.expectBody, c.intervalMin, c.timeoutMs, c.env, c.enabled, by, now],
  );
  return id;
}

/** Save a change. A shorter interval brings the next run closer; a check turned off ends its open incident and starts over as pending. */
export async function updateCheck(q: Queryable, secrets: readonly AuthSecret[], current: CloudCheck, c: UptimeCheckInput, now: number): Promise<void> {
  const next = Math.min(nextRunMs({ lastRunMs: current.lastRunMs, intervalMin: c.intervalMin }, now), now + c.intervalMin * 60_000);
  await q.query(
    `UPDATE uptime_checks SET name = $2, url = $3, method = $4, headers = $5, expect_status = $6, expect_body = $7, interval_min = $8, timeout_ms = $9,
       env = $10, enabled = $11, next_ms = $12, state = CASE WHEN $11 THEN state ELSE 'pending' END WHERE id = $1`,
    [current.id, c.name, c.url, c.method, await sealHeaders(secrets, c.headers), c.expectStatus, c.expectBody, c.intervalMin, c.timeoutMs, c.env, c.enabled, next],
  );
  if (!c.enabled) await q.query("UPDATE uptime_incidents SET end_ms = $2 WHERE check_id = $1 AND end_ms IS NULL", [current.id, now]);
}

export async function deleteCheck(q: Queryable, projectId: string, id: string): Promise<boolean> {
  return (await q.query("DELETE FROM uptime_checks WHERE project_id = $1 AND id = $2 RETURNING id", [projectId, id])).length > 0;
}

/** Take the checks that are due and push their next run out, in one step, so two cloud replicas never run the same check. */
export async function claimDue(q: Queryable, secrets: readonly AuthSecret[], now: number, limit: number): Promise<CloudCheck[]> {
  const rows = await q.query<Row>(
    `UPDATE uptime_checks SET next_ms = $1 + interval_min * 60000
     WHERE id IN (SELECT id FROM uptime_checks WHERE enabled AND next_ms <= $1 ORDER BY next_ms LIMIT $2 FOR UPDATE SKIP LOCKED)
     RETURNING ${COLUMNS}`,
    [now, limit],
  );
  return toChecks(secrets, rows);
}

/** Keep a run's result on its check, and open or close an incident. */
export async function saveRun(q: Queryable, c: CloudCheck, r: UptimeResult): Promise<void> {
  const change = changeOf(c, r);
  const last = lastRunOf(r);
  await q.query("UPDATE uptime_checks SET state = $2, last_run_ms = $3, last_duration_ms = $4, last_status = $5, last_error = $6, tls_expires_ms = $7 WHERE id = $1", [
    c.id, last.state, last.lastRunMs, last.lastDurationMs, last.lastStatus, last.lastError, last.tlsExpiresMs,
  ]);
  if (change.open !== null) await q.query("INSERT INTO uptime_incidents (id, check_id, project_id, start_ms, reason) VALUES ($1, $2, $3, $4, $5)", [newId(), c.id, c.projectId, r.startMs, change.open]);
  if (change.closeAtMs !== null) await q.query("UPDATE uptime_incidents SET end_ms = $2 WHERE check_id = $1 AND end_ms IS NULL", [c.id, change.closeAtMs]);
}

/** A project's incidents still open or ended in the last 90 days. */
export const listIncidents = (q: Queryable, projectId: string, now: number): Promise<UptimeIncident[]> =>
  q.query<UptimeIncident>(
    `SELECT id, check_id AS "checkId", start_ms AS "startMs", end_ms AS "endMs", reason FROM uptime_incidents
     WHERE project_id = $1 AND (end_ms IS NULL OR end_ms >= $2) ORDER BY start_ms DESC`,
    [projectId, now - UPTIME_KEEP_MS],
  );

export const pruneIncidents = async (q: Queryable, now: number): Promise<void> => void (await q.query("DELETE FROM uptime_incidents WHERE end_ms < $1", [now - UPTIME_KEEP_MS]));
