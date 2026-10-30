// Small mode: telemetry in the same Postgres (or PGlite) as accounts. The default, and what self-hosters and tests run.
import { PG_DIALECT, searchSql, suggestSql, type TimeWindow } from "@wizeworks/lens-core/internal";
import type { Db, Queryable } from "../db/db.js";
import { ensureTrigram } from "../db/trigram.js";
import { loadInfraData, loadMetricAlertData, loadMetricData } from "../repo/metric-read.js";
import { METRIC_TABLES } from "../repo/metric-write.js";
import { getJoinedTrace } from "../repo/trace-join.js";
import { countRows, getTrace, queryTraces, traceEnvsPg } from "../repo/trace-read.js";
import { pruneLogsByRetention } from "../repo/log-retention.js";
import { pruneByRetention, pruneMetricsByRetention, writeTelemetry } from "../repo/trace-write.js";
import { cloudExecutor, cloudSettling, pgRunner } from "../scale-exec.js";
import { factsStale, pruneRollups, resetFacts, settleCloud, STATS_TABLES } from "../settle.js";
import { sqlScope, type TelemetryStore, type TenantScope } from "./store.js";

const TELEMETRY_TABLES = ["spans", "logs", "traces", "metric_points", ...METRIC_TABLES, ...STATS_TABLES];

async function slowestEndpoints(db: Queryable, s: TenantScope, w: TimeWindow, minCount: number, limit: number) {
  const rows = await db.query<{ endpoint: string; p95: number; n: number }>(
    `SELECT endpoint, percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95, count(*)::int AS n FROM fact_requests
     WHERE org_id = $1 AND project_id = ANY($2) AND start_ms >= $3 AND start_ms < $4 GROUP BY endpoint HAVING count(*) >= $5 ORDER BY p95 DESC LIMIT $6`,
    [s.org, [...s.projects], w.from, w.to, minCount, limit],
  );
  return rows.map((r) => ({ endpoint: r.endpoint, p95Ms: Number(r.p95), count: r.n }));
}

async function lastTraceMs(db: Db): Promise<Map<string, number>> {
  const rows = await db.query<{ project_id: string; last_ms: number }>("SELECT project_id, max(start_ms) AS last_ms FROM traces GROUP BY project_id");
  return new Map(rows.map((r) => [r.project_id, Number(r.last_ms)]));
}

async function activeHours(db: Queryable, s: TenantScope, from: number, to: number): Promise<number> {
  const [row] = await db.query<{ n: number }>(
    "SELECT count(DISTINCT floor(start_ms / 3600000))::int AS n FROM traces WHERE org_id = $1 AND project_id = ANY($2) AND start_ms > $3 AND start_ms <= $4",
    [s.org, [...s.projects], from, to],
  );
  return row?.n ?? 0;
}

/** Traces, then log lines, then metrics past retention, then the rollup buckets past their keep. */
async function pruneAll(db: Db, now: number): Promise<void> {
  while ((await pruneByRetention(db, now)) > 0);
  await pruneLogsByRetention(db, now);
  await pruneMetricsByRetention(db, now);
  await pruneRollups(db, now, true);
}

/** Telemetry in the cloud's own database. Retention reads the organizations from the same database. */
/** Reads as `wl_reader` for one organization: row level security holds every row to it, whatever the SQL says. */
export function pgReader(db: Db, org: string): Queryable {
  return {
    query: (sql, params) =>
      db.tx(async (q) => {
        await q.query("SET LOCAL ROLE wl_reader");
        await q.query("SELECT set_config('wl.org', $1, true)", [org]);
        return q.query(sql, params);
      }),
  };
}

export function pgTelemetry(db: Db): TelemetryStore {
  const read = (s: TenantScope) => pgReader(db, s.org);
  const src = (s: TenantScope) => ({ d: PG_DIALECT, run: pgRunner(read(s)), scope: sqlScope(s) });
  // A facts reset can take minutes on a big database, so it runs after start; settling waits for it, and tries again if it failed.
  let reset: Promise<void> = Promise.resolve();
  const startReset = () => {
    reset = resetFacts(db);
    reset.catch((err: unknown) => console.error("Facts reset failed; settling tries again.", err));
  };
  // Trigram indexes build in the background too; close waits for them.
  let trigram: Promise<unknown> = Promise.resolve();
  return {
    kind: "postgres",
    write: (projectId, w, now) => db.tx((q) => writeTelemetry(q, projectId, w, now)),
    traces: (t) => queryTraces(read(t.scope), t),
    trace: (s, traceId) => getTrace(read(s), s, traceId),
    joinedTrace: (primaryId, s, traceId) => getJoinedTrace(read(s), primaryId, s, traceId),
    counts: (s) => countRows(read(s), s),
    traceEnvs: (s) => traceEnvsPg(read(s), s),
    activeHours: (s, from, to) => activeHours(read(s), s, from, to),
    lastTraceMs: () => lastTraceMs(db),
    executor: (s, retentionMs, env) => cloudExecutor(read(s), s, retentionMs, env),
    settling: (s, o) => cloudSettling(read(s), s, o),
    search: (s, q) => searchSql(src(s), q),
    suggest: (s, r) => suggestSql(src(s), r),
    slowestEndpoints: (s, w, minCount, limit) => slowestEndpoints(read(s), s, w, minCount, limit),
    metricData: (m, range, params, now) => loadMetricData(read(m.scope), m, range, params, now),
    metricAlertData: (m, name, w, now) => loadMetricAlertData(read(m.scope), m, name, w, now),
    infraData: (m, range, params, now) => loadInfraData(read(m.scope), m, range, params, now),
    async settle(now, o) {
      await reset.catch(() => (startReset(), reset));
      return settleCloud(db, now, o);
    },
    prune: (now) => pruneAll(db, now),
    pruneRollups: (now) => pruneRollups(db, now),
    async checkFactsVersion() {
      trigram = ensureTrigram(db).catch((err: unknown) => console.error("Trigram indexes failed; text searches scan until the next start.", err));
      if (!(await factsStale(db))) return false;
      startReset();
      return true;
    },
    async clearProject(projectId) {
      for (const table of TELEMETRY_TABLES) await db.query(`DELETE FROM ${table} WHERE project_id = $1`, [projectId]);
    },
    close: async () => void (await trigram),
  };
}
