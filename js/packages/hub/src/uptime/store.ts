import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { changeOf, lastRunOf, nextRunMs, UPTIME_KEEP_MS, type UptimeCheck, type UptimeCheckInput, type UptimeIncident, type UptimeResult } from "@wizeworks/lens-core/internal";

// Uptime checks and incidents in the hub file (docs/CONTRACT.md, "Hub storage"). Results themselves are traces.
export const HUB_UPTIME_SCHEMA = `
CREATE TABLE IF NOT EXISTS uptime_checks (
  id TEXT PRIMARY KEY, project TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, url TEXT NOT NULL, method TEXT NOT NULL, headers TEXT NOT NULL,
  expect_status TEXT NOT NULL, expect_body TEXT NOT NULL, interval_min INTEGER NOT NULL, timeout_ms INTEGER NOT NULL, env TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL, created_ms REAL NOT NULL, state TEXT NOT NULL DEFAULT 'pending', last_run_ms REAL, last_duration_ms REAL,
  last_status INTEGER, last_error TEXT, tls_expires_ms REAL, next_ms REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_uptime_checks_next ON uptime_checks (next_ms);
CREATE TABLE IF NOT EXISTS uptime_incidents (
  id TEXT PRIMARY KEY, check_id TEXT NOT NULL, start_ms REAL NOT NULL, end_ms REAL, reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_uptime_incidents_check ON uptime_incidents (check_id, start_ms);
`;

export type HubCheck = UptimeCheck & { project: string };

const COLUMNS = `id, project, name, url, method, headers, expect_status AS expectStatus, expect_body AS expectBody, interval_min AS intervalMin,
  timeout_ms AS timeoutMs, env, enabled, created_ms AS createdMs, state, last_run_ms AS lastRunMs, last_duration_ms AS lastDurationMs,
  last_status AS lastStatus, last_error AS lastError, tls_expires_ms AS tlsExpiresMs`;

type Row = Omit<HubCheck, "headers" | "enabled"> & { headers: string; enabled: number };
const toCheck = (r: Row): HubCheck => ({ ...r, headers: JSON.parse(r.headers) as Record<string, string>, enabled: r.enabled === 1 });
const rows = (db: DatabaseSync, sql: string, ...params: SQLInputValue[]) => (db.prepare(sql).all(...params) as unknown as Row[]).map(toCheck);

/** Checks of one project, or of every project when none is given. */
export const listChecks = (db: DatabaseSync, project?: string): HubCheck[] =>
  project === undefined ? rows(db, `SELECT ${COLUMNS} FROM uptime_checks ORDER BY name`) : rows(db, `SELECT ${COLUMNS} FROM uptime_checks WHERE project = ? ORDER BY name`, project);

export const checkById = (db: DatabaseSync, id: string): HubCheck | undefined => rows(db, `SELECT ${COLUMNS} FROM uptime_checks WHERE id = ?`, id)[0];

export const countChecks = (db: DatabaseSync): number => (db.prepare("SELECT count(*) AS n FROM uptime_checks").get() as { n: number }).n;

export function createCheck(db: DatabaseSync, project: string, c: UptimeCheckInput, now: number): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO uptime_checks (id, project, name, url, method, headers, expect_status, expect_body, interval_min, timeout_ms, env, enabled, created_ms, next_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, project, c.name, c.url, c.method, JSON.stringify(c.headers), c.expectStatus, c.expectBody, c.intervalMin, c.timeoutMs, c.env, c.enabled ? 1 : 0, now, now);
  return id;
}

/** Save a change. A new interval moves the next run; turning a check off leaves its incidents as they are. */
export function updateCheck(db: DatabaseSync, current: HubCheck, c: UptimeCheckInput, now: number): void {
  const next = Math.min(nextRunMs({ lastRunMs: current.lastRunMs, intervalMin: c.intervalMin }, now), now + c.intervalMin * 60_000);
  db.prepare(
    `UPDATE uptime_checks SET name = ?, url = ?, method = ?, headers = ?, expect_status = ?, expect_body = ?, interval_min = ?, timeout_ms = ?, env = ?,
     enabled = ?, next_ms = ? WHERE id = ?`,
  ).run(c.name, c.url, c.method, JSON.stringify(c.headers), c.expectStatus, c.expectBody, c.intervalMin, c.timeoutMs, c.env, c.enabled ? 1 : 0, next, current.id);
  if (c.enabled) return;
  // A check turned off is not down: its open incident ends now, and it starts over as pending.
  db.prepare("UPDATE uptime_incidents SET end_ms = ? WHERE check_id = ? AND end_ms IS NULL").run(now, current.id);
  db.prepare("UPDATE uptime_checks SET state = 'pending' WHERE id = ?").run(current.id);
}

export function deleteCheck(db: DatabaseSync, id: string): boolean {
  db.prepare("DELETE FROM uptime_incidents WHERE check_id = ?").run(id);
  return Number(db.prepare("DELETE FROM uptime_checks WHERE id = ?").run(id).changes) > 0;
}

/** Enabled checks whose next run is due. */
export const dueChecks = (db: DatabaseSync, now: number): HubCheck[] => rows(db, `SELECT ${COLUMNS} FROM uptime_checks WHERE enabled = 1 AND next_ms <= ? ORDER BY next_ms LIMIT 50`, now);

/** Push a check's next run out before it runs, so a slow run is not started twice. */
export const claimRun = (db: DatabaseSync, c: HubCheck, now: number): void => void db.prepare("UPDATE uptime_checks SET next_ms = ? WHERE id = ?").run(now + c.intervalMin * 60_000, c.id);

/** Keep a run's result on its check, and open or close an incident. */
export function saveRun(db: DatabaseSync, c: HubCheck, r: UptimeResult): void {
  const change = changeOf(c, r);
  const last = lastRunOf(c, r);
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE uptime_checks SET state = ?, last_run_ms = ?, last_duration_ms = ?, last_status = ?, last_error = ?, tls_expires_ms = ?, created_ms = ? WHERE id = ?").run(
      last.state, last.lastRunMs, last.lastDurationMs, last.lastStatus, last.lastError, last.tlsExpiresMs, last.createdMs, c.id,
    );
    if (change.open !== null) db.prepare("INSERT INTO uptime_incidents (id, check_id, start_ms, end_ms, reason) VALUES (?, ?, ?, NULL, ?)").run(randomUUID(), c.id, r.startMs, change.open);
    if (change.closeAtMs !== null) db.prepare("UPDATE uptime_incidents SET end_ms = ? WHERE check_id = ? AND end_ms IS NULL").run(change.closeAtMs, c.id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Incidents of the given checks still open or ended in the last 90 days. */
export function listIncidents(db: DatabaseSync, checkIds: readonly string[], now: number): UptimeIncident[] {
  if (checkIds.length === 0) return [];
  const marks = checkIds.map(() => "?").join(", ");
  return db
    .prepare(`SELECT id, check_id AS checkId, start_ms AS startMs, end_ms AS endMs, reason FROM uptime_incidents WHERE check_id IN (${marks}) AND (end_ms IS NULL OR end_ms >= ?)`)
    .all(...checkIds, now - UPTIME_KEEP_MS) as unknown as UptimeIncident[];
}

/** Drop incidents that ended more than 90 days ago. */
export const pruneIncidents = (db: DatabaseSync, now: number): void => void db.prepare("DELETE FROM uptime_incidents WHERE end_ms IS NOT NULL AND end_ms < ?").run(now - UPTIME_KEEP_MS);
