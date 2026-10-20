import { type FactOptions, FACT_TABLES, FACTS_VERSION, factOptionsOf, LOG_KINDS_SQL, PG_DIALECT, settingsOf, settleStatements, type Statement, tierPruneStatements, type TraceState, type Trace } from "@wizeworks/lens-core";
import type { Db, Queryable } from "./db/db.js";
import { loadSettling } from "./repo/trace-read.js";
import type { SettleOptions } from "./telemetry/store.js";
import { KEEP_DAYS } from "./repo/settings.js";

// Settling: traces quiet for a while get their facts and rollups rebuilt from the stored spans and logs (docs/CONTRACT.md).
const BATCH = 500;
const BUDGET_MS = 2_000;
const QUIET_MS = 5_000;
const BUSY_MS = 30_000;
const LOCK = 4711;
const DAY_MS = 86_400_000;
const RESET_BATCH = 5_000;
/** Fact, rollup, and hist tables: everything settling builds. */
export const STATS_TABLES = [...FACT_TABLES, ...["10s", "5m", "1h"].flatMap((t) => [`rollup_${t}`, `hist_${t}`])];

export interface TraceStateRow {
  project_id: string;
  /** The organization the row carries ('' for a project that is gone). */
  org_id?: string;
  trace_id: string;
  env: string;
  updated_ms?: number;
  contrib: string | null;
  retention_days: number | null;
  log_retention_days?: number | null;
  /** The project's settings JSON, when the settle reads it. */
  settings?: string | null;
}

/** Run statements one by one, in the caller's transaction. */
export async function runStatements(q: Queryable, statements: readonly Statement[]): Promise<void> {
  for (const s of statements) await q.query(s.sql, s.params);
}

export const stateOf = (r: TraceStateRow, defaultDays: number, defaultFacts: Partial<FactOptions> = {}): TraceState => ({
  traceId: r.trace_id,
  project: r.project_id,
  env: r.env,
  updatedMs: r.updated_ms ?? 0,
  contrib: r.contrib,
  retentionMs: (r.retention_days ?? defaultDays) * DAY_MS,
  logRetentionMs: (r.log_retention_days ?? r.retention_days ?? defaultDays) * DAY_MS,
  facts: { ...defaultFacts, ...factOptionsOf(settingsOf(r.settings)) },
});

async function loadAll(q: Queryable, rows: readonly TraceStateRow[]): Promise<Map<string, Trace>> {
  const byProject = new Map<string, { org: string; ids: string[] }>();
  for (const r of rows) byProject.set(r.project_id, { org: r.org_id ?? "", ids: [...(byProject.get(r.project_id)?.ids ?? []), r.trace_id] });
  const out = new Map<string, Trace>();
  for (const [project, { org, ids }] of byProject) for (const t of await loadSettling(q, org, project, ids)) out.set(`${project} ${t.traceId}`, t);
  return out;
}

/** Settle one batch in one transaction. -1 when another instance holds the lock. */
async function settleBatch(db: Db, now: number, batch: number, defaultDays: number, defaultFacts?: Partial<FactOptions>): Promise<{ n: number; projects: string[] }> {
  return db.tx(async (q) => {
    const [lock] = await q.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [LOCK]);
    if (!lock?.ok) return { n: -1, projects: [] };
    const rows = await q.query<TraceStateRow>(
      `SELECT t.project_id, t.org_id, t.trace_id, t.env, t.updated_ms, t.contrib, ${KEEP_DAYS} AS retention_days, p.log_retention_days, p.settings FROM traces t
       LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN orgs o ON o.id = p.org_id
       WHERE t.settled_ms < t.updated_ms AND (t.updated_ms <= $1 OR t.settled_ms <= $2) ORDER BY t.start_ms DESC LIMIT $3`,
      [now - QUIET_MS, now - BUSY_MS, batch],
    );
    if (!rows.length) return { n: 0, projects: [] };
    const traces = await loadAll(q, rows);
    const work = rows.map((r) => ({ state: stateOf(r, defaultDays, defaultFacts), trace: traces.get(`${r.project_id} ${r.trace_id}`) }));
    await runStatements(q, settleStatements(PG_DIALECT, work, now, true));
    return { n: rows.length, projects: [...new Set(rows.map((r) => r.project_id))] };
  });
}

/** Settle dirty traces in batches until none are left or the budget is spent. Returns how many settled. */
export async function settleCloud(db: Db, now: number, o: SettleOptions = {}): Promise<number> {
  const start = Date.now();
  const batch = o.batch ?? BATCH;
  let total = 0;
  for (;;) {
    const { n, projects } = await settleBatch(db, now, batch, o.defaultRetentionDays ?? 30, o.defaultFacts);
    if (n > 0) total += n;
    for (const p of projects) o.onSettled?.(p);
    if (n < batch || Date.now() - start >= (o.budgetMs ?? BUDGET_MS)) return total;
  }
}

/** Age out rollup buckets: 10 s and 5 min by their keep time, 1 h by each organization's retention (log kinds by the log retention, in pruneLogsByRetention). */
export async function pruneRollups(q: Queryable, now: number, empties = false): Promise<void> {
  await runStatements(q, tierPruneStatements(now, empties));
  for (const t of ["rollup_1h", "hist_1h"]) {
    await q.query(
      `DELETE FROM ${t} r USING projects p, orgs o WHERE p.id = r.project_id AND o.id = p.org_id AND r.bucket_ms <= $1 - ${KEEP_DAYS} * 86400000.0 AND r.kind NOT IN (${LOG_KINDS_SQL})`,
      [now - 3_600_000],
    );
  }
}

/** True when the stats were built by another facts version (or never). */
export async function factsStale(db: Db): Promise<boolean> {
  const [row] = await db.query<{ value: string }>("SELECT value FROM scale_meta WHERE key = 'facts'");
  return row?.value !== String(FACTS_VERSION);
}

/** Clear the stats and mark every trace unsettled, in batches that commit; a restart starts it again and the version is written last. */
export async function resetFacts(db: Db): Promise<void> {
  await db.query(`TRUNCATE ${STATS_TABLES.join(", ")}`);
  const mark = "UPDATE traces SET settled_ms = 0, contrib = NULL WHERE (project_id, trace_id) > ($1, $2)";
  let after = ["", ""];
  for (;;) {
    const [end] = await db.query<{ project_id: string; trace_id: string }>(
      `SELECT project_id, trace_id FROM traces WHERE (project_id, trace_id) > ($1, $2) ORDER BY project_id, trace_id OFFSET ${RESET_BATCH - 1} LIMIT 1`,
      after,
    );
    if (!end) break;
    await db.query(`${mark} AND (project_id, trace_id) <= ($3, $4)`, [...after, end.project_id, end.trace_id]);
    after = [end.project_id, end.trace_id];
  }
  await db.query(mark, after);
  await db.query("INSERT INTO scale_meta (key, value) VALUES ('facts', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [String(FACTS_VERSION)]);
}

/** When the facts version changed, clear the stats so settling rebuilds them. Returns true when it did. */
export async function checkFactsVersion(db: Db): Promise<boolean> {
  if (!(await factsStale(db))) return false;
  await resetFacts(db);
  return true;
}
