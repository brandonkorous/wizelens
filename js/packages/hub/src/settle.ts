import type { DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";
import { pruneStatements, SQLITE_DIALECT, settleStatements, type Statement, tierByName, tierCutoff, tierPruneStatements, type TraceState } from "@wizeworks/lens-core";
import { loadTraces } from "./store-read.js";
import type { HubStore } from "./store.js";

// Settling: traces quiet for a while get their facts and rollups rebuilt from the stored spans and logs (docs/CONTRACT.md).
const BATCH = 200;
const BUDGET_MS = 150;
const QUIET_MS = 5_000;
const BUSY_MS = 30_000;
const CACHE_MAX = 300;

/** A trace row as the settle and prune steps read it. */
export interface TraceStateRow {
  trace_id: string;
  project: string;
  env: string;
  updated_ms?: number;
  contrib: string | null;
}

const caches = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

/** Run statements in the caller's transaction, with prepared statements kept per file. */
export function runStatements(db: DatabaseSync, statements: readonly Statement[]): void {
  let cache = caches.get(db);
  if (!cache) caches.set(db, (cache = new Map()));
  for (const s of statements) {
    let st = cache.get(s.sql);
    if (!st) {
      if (cache.size >= CACHE_MAX) cache.clear();
      cache.set(s.sql, (st = db.prepare(s.sql)));
    }
    st.run(...(s.params as SQLInputValue[]));
  }
}

function inTransaction(db: DatabaseSync, fn: () => void): void {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const stateOf = (store: HubStore, r: TraceStateRow): TraceState => ({
  traceId: r.trace_id,
  project: r.project,
  env: r.env,
  updatedMs: r.updated_ms ?? 0,
  contrib: r.contrib,
  retentionMs: store.maxAgeMs,
});

/** Settle one batch of dirty traces, newest first. Returns how many. */
function settleBatch(store: HubStore, batch: number): number {
  const now = store.now();
  const rows = store.db
    .prepare(
      `SELECT trace_id, project, env, updated_ms, contrib FROM traces WHERE settled_ms < updated_ms AND (updated_ms <= ? OR settled_ms <= ?)
       ORDER BY start_ms DESC LIMIT ?`,
    )
    .all(now - QUIET_MS, now - BUSY_MS, batch) as unknown as TraceStateRow[];
  if (!rows.length) return 0;
  const traces = loadTraces(store.db, rows.map((r) => r.trace_id));
  const work = rows.map((r, i) => ({ state: stateOf(store, r), trace: traces[i] }));
  inTransaction(store.db, () => runStatements(store.db, settleStatements(SQLITE_DIALECT, work, now, false)));
  return rows.length;
}

/** Settle dirty traces for up to `budgetMs`, so the event loop is not held for long. Returns how many settled. */
export function settleHub(store: HubStore, o: { budgetMs?: number; batch?: number } = {}): number {
  const start = performance.now();
  const batch = o.batch ?? BATCH;
  let total = 0;
  for (;;) {
    const n = settleBatch(store, batch);
    total += n;
    if (n < batch || performance.now() - start >= (o.budgetMs ?? BUDGET_MS)) break;
  }
  if (total) store.settleGen++;
  return total;
}

/** The settle timer's job: errors are logged, never thrown into the timer. */
export function settleQuietly(store: HubStore): void {
  try {
    settleHub(store);
  } catch (err) {
    console.error("[wizelens-hub] settle failed:", err);
  }
}

/** In the prune transaction: take the doomed traces out of the rollups, drop their facts, and age out rollup buckets. */
export function pruneStats(store: HubStore, doomed: readonly TraceStateRow[]): void {
  const now = store.now();
  runStatements(store.db, pruneStatements(SQLITE_DIALECT, doomed.map((r) => stateOf(store, r)), now, false));
  runStatements(store.db, tierPruneStatements(now, true));
  const cutoff = tierCutoff(tierByName("1h"), now, store.maxAgeMs);
  for (const t of ["rollup_1h", "hist_1h"]) store.db.prepare(`DELETE FROM ${t} WHERE bucket_ms <= ?`).run(cutoff);
  if (doomed.length) store.settleGen++;
}

/** Traces whose stats are not built yet, for "Preparing stats". */
export function settlingCount(db: DatabaseSync, scope: { project?: string; env?: string } = {}): number {
  const where = ["settled_ms < updated_ms"];
  const args: SQLInputValue[] = [];
  if (scope.project) where.push("project = ?"), args.push(scope.project);
  if (scope.env) where.push("env = ?"), args.push(scope.env);
  return (db.prepare(`SELECT count(*) AS n FROM traces WHERE ${where.join(" AND ")}`).get(...args) as { n: number }).n;
}
