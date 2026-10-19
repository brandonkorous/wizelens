import { createHash } from "node:crypto";
import { ATTR_BROWSER_SESSION, INFRA_SERVICE, logKey, LOOSE_TRACE_PREFIX, PG_DIALECT, pruneStatements, seriesKeyOf, type Span } from "@wizeworks/lens-core";
import type { HubWrite } from "@wizeworks/lens-hub/kit";
import type { Db, Queryable } from "../db/db.js";
import { runStatements, stateOf, type TraceStateRow } from "../settle.js";
import { LOG_DAYS_SQL } from "./log-retention.js";
import { pruneMetricRollups, writeMetricRollups } from "./metric-write.js";

const CHUNK = 200;

/** `INSERT ... VALUES ($1, $2), ($3, $4) ... <tail>` for many rows at once. */
async function insertMany(q: Queryable, head: string, rows: unknown[][], tail: string): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const width = part[0]!.length;
    const values = part.map((_, r) => `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(", ")})`);
    await q.query(`${head} VALUES ${values.join(", ")} ${tail}`, part.flat());
  }
}

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

const sessionOf = (s: Span) => {
  const v = s.attributes[ATTR_BROWSER_SESSION];
  return typeof v === "string" && v ? v : null;
};

/** Trace rows: one per trace id, with the earliest start and latest end in this batch. */
function traceRows(w: HubWrite, projectId: string, now: number): unknown[][] {
  const bounds = new Map<string, [number, number]>();
  const touch = (id: string, start: number, end: number) => {
    const b = bounds.get(id);
    bounds.set(id, b ? [Math.min(b[0], start), Math.max(b[1], end)] : [start, end]);
  };
  for (const s of w.spans) touch(s.traceId, s.startMs, s.startMs + s.durationMs);
  for (const { traceId, log } of w.logs) touch(traceId, log.timeMs, log.timeMs);
  const env = w.sender.environment ?? "";
  return [...bounds].map(([id, [start, end]]) => [projectId, id, start, end, now, env]);
}

/** Record the sender in the project's service registry (Postgres, whatever keeps the telemetry). */
export async function writeService(q: Queryable, projectId: string, w: HubWrite, now: number): Promise<void> {
  const s = w.sender;
  // The collector's host and Kubernetes receivers are not a service.
  if (s.service === INFRA_SERVICE) return;
  await q.query(
    `INSERT INTO services (project_id, service, environment, host, via, info, first_seen, last_seen) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (project_id, service, environment, host) DO UPDATE SET via = EXCLUDED.via, info = EXCLUDED.info, last_seen = EXCLUDED.last_seen`,
    [projectId, s.service, s.environment ?? "", s.host ?? "", w.via, JSON.stringify(s), now],
  );
}

/** Save one batch for one project: registry and telemetry, in the caller's transaction (Postgres small mode, and tests). */
export async function writeBatch(q: Queryable, projectId: string, w: HubWrite, now: number): Promise<void> {
  await writeService(q, projectId, w, now);
  await writeTelemetry(q, projectId, w, now);
}

/** Save one batch's spans, logs, trace bounds, and metrics to Postgres, in the caller's transaction. */
export async function writeTelemetry(q: Queryable, projectId: string, w: HubWrite, now: number): Promise<void> {
  const s = w.sender;
  await insertMany(q, "INSERT INTO traces (project_id, trace_id, start_ms, end_ms, updated_ms, env)", traceRows(w, projectId, now), `
    ON CONFLICT (project_id, trace_id) DO UPDATE SET start_ms = LEAST(traces.start_ms, EXCLUDED.start_ms),
      end_ms = GREATEST(traces.end_ms, EXCLUDED.end_ms), updated_ms = EXCLUDED.updated_ms,
      env = CASE WHEN traces.env = '' THEN EXCLUDED.env ELSE traces.env END`);
  const spans = dedupe(w.spans, (x) => x.traceId + x.spanId).map((x) => [projectId, x.traceId, x.spanId, x.service, x.startMs, x.durationMs, sessionOf(x), JSON.stringify(x)]);
  await insertMany(q, "INSERT INTO spans (project_id, trace_id, span_id, service, start_ms, duration_ms, session, json)", spans, `
    ON CONFLICT (project_id, trace_id, span_id) DO UPDATE SET json = EXCLUDED.json, duration_ms = EXCLUDED.duration_ms`);
  const logs = dedupe(
    w.logs.map(({ traceId, log }) => ({ traceId, log, key: createHash("sha1").update(logKey(log)).digest("hex") })),
    (l) => l.traceId + l.key,
  ).map((l) => [projectId, l.traceId, l.key, l.log.timeMs, JSON.stringify(l.log)]);
  await insertMany(q, "INSERT INTO logs (project_id, trace_id, key, time_ms, json)", logs, "ON CONFLICT DO NOTHING");
  const env = s.environment ?? "";
  // The series key holds NUL separators, which Postgres text cannot store, so keep its hash.
  const metrics = (w.metrics ?? []).map((p) => [projectId, p.timeMs, env, p.service, p.name, sha1(seriesKeyOf(p)), JSON.stringify(p)]);
  await insertMany(q, "INSERT INTO metric_points (project_id, time_ms, env, service, name, series_key, json)", metrics, "");
  await writeMetricRollups(q, projectId, env, w.metrics ?? [], now);
}

/** Postgres rejects one statement that updates the same row twice, so keep the last of each key. */
function dedupe<T>(items: readonly T[], key: (t: T) => string): T[] {
  const map = new Map<string, T>();
  for (const t of items) map.set(key(t), t);
  return [...map.values()];
}

/** Drop metric points older than each organization's retention. */
export async function pruneMetricsByRetention(q: Queryable, now: number): Promise<void> {
  await q.query(
    `DELETE FROM metric_points m USING projects p, orgs o WHERE p.id = m.project_id AND o.id = p.org_id
     AND m.time_ms < $1 - o.retention_days * 86400000.0`,
    [now],
  );
  await pruneMetricRollups(q, now);
}

/** Drop traces older than each organization's retention, and loose batches (lines outside a request) older than the log retention. Returns how many were dropped. */
export async function pruneByRetention(q: Queryable, now: number): Promise<number> {
  const loose = `substr(t.trace_id, 1, 16) = '${LOOSE_TRACE_PREFIX}'`;
  const prune = async (x: Queryable) => {
    const doomed = await x.query<TraceStateRow>(
      `SELECT t.project_id, t.trace_id, t.env, t.contrib, o.retention_days, p.log_retention_days FROM traces t JOIN projects p ON p.id = t.project_id JOIN orgs o ON o.id = p.org_id
       WHERE (NOT ${loose} AND t.start_ms < $1 - o.retention_days * 86400000.0) OR (${loose} AND t.start_ms < $1 - ${LOG_DAYS_SQL} * 86400000.0) LIMIT 5000`,
      [now],
    );
    // Take their contributions out of the rollups and drop their facts first.
    await runStatements(x, pruneStatements(PG_DIALECT, doomed.map((d) => stateOf(d, d.retention_days ?? 30)), now, true));
    for (const table of ["spans", "logs", "traces"]) {
      for (const d of doomed) await x.query(`DELETE FROM ${table} WHERE project_id = $1 AND trace_id = $2`, [d.project_id, d.trace_id]);
    }
    return doomed.length;
  };
  return "tx" in q ? (q as Db).tx(prune) : prune(q);
}
