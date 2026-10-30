import { createHash } from "node:crypto";
import type { DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";
import {
  groupMetricSeries,
  type MergedHistogram,
  mergeStoredHists,
  metricBatchWrites,
  metricHistOfColumns,
  metricHistStateSql,
  metricSeriesInsertSql,
  type MetricPoint,
  type MetricSeriesWrite,
  metricSeriesUpsertSql,
  metricSeriesValues,
  tierCutoff,
  type MetricState,
  metricStateOfColumns,
  metricStateSql,
  type MetricTierWrite,
  metricTierUpsertSql,
  metricTierValues,
  seriesKeyOf,
  TIERS,
} from "@wizeworks/lens-core/internal";

// Metric rollups at ingest (docs/CONTRACT.md, "Hub storage"): points never change, so tiers are written with the raw points.
const hashKey = (text: string) => createHash("sha1").update(text).digest("hex");
const statements = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

function prepared(db: DatabaseSync, sql: string): StatementSync {
  const map = statements.get(db) ?? new Map<string, StatementSync>();
  statements.set(db, map);
  const hit = map.get(sql);
  if (hit) return hit;
  const st = db.prepare(sql);
  map.set(sql, st);
  return st;
}

const all = (db: DatabaseSync, q: { sql: string; args: unknown[] }) => prepared(db, q.sql).all(...(q.args as SQLInputValue[])) as Record<string, unknown>[];

function statesOf(db: DatabaseSync, project: string, env: string, keys: readonly string[]): Map<string, MetricState | null> {
  return new Map(all(db, metricStateSql("sqlite", project, env, keys)).map((r) => [String(r.series_key), metricStateOfColumns(r)]));
}

/** The stored histograms of the tier buckets this batch adds histogram counts to. */
function storedHists(db: DatabaseSync, project: string, env: string, tiers: readonly MetricTierWrite[]): (t: MetricTierWrite) => MergedHistogram | null {
  const stored = new Map<string, MergedHistogram | null>();
  for (const tier of TIERS) {
    const mine = tiers.filter((t) => t.tier === tier && t.row.hist);
    if (mine.length === 0) continue;
    const q = metricHistStateSql("sqlite", tier, project, env, [...new Set(mine.map((t) => t.key))], [...new Set(mine.map((t) => t.bucket))]);
    for (const r of all(db, q)) stored.set(`${tier.name} ${r.series_key} ${r.bucket_ms}`, metricHistOfColumns(r));
  }
  return (t) => stored.get(`${t.tier.name} ${t.key} ${t.bucket}`) ?? null;
}

/** Write a batch's series from the given states; `seriesSql` upserts the series, or only adds missing ones (backfill). */
export function writeMetricGroups(db: DatabaseSync, project: string, env: string, groups: Map<string, MetricPoint[]>, states: Map<string, MetricState | null>, now: number, seriesSql: string): MetricSeriesWrite[] {
  const { series, tiers } = metricBatchWrites(groups, states, now);
  mergeStoredHists(tiers, storedHists(db, project, env, tiers));
  for (const t of tiers) prepared(db, metricTierUpsertSql("sqlite", t.tier, 1)).run(...(metricTierValues("sqlite", project, env, t) as SQLInputValue[]));
  const upsert = prepared(db, seriesSql);
  for (const s of series) upsert.run(...(metricSeriesValues("sqlite", project, env, s) as SQLInputValue[]));
  return series;
}

export const metricKeyOf = (p: MetricPoint): string => hashKey(seriesKeyOf(p));

/** Add one batch's points to the metric tiers and series state, in the caller's transaction. */
export function writeMetricRollups(db: DatabaseSync, project: string, env: string, points: readonly MetricPoint[], now: number): void {
  if (points.length === 0) return;
  const groups = groupMetricSeries(points, metricKeyOf);
  writeMetricGroups(db, project, env, groups, statesOf(db, project, env, [...groups.keys()]), now, metricSeriesUpsertSql("sqlite", 1));
}

/** Drop tier buckets past their keep (10 s and 5 min tiers) or the hub's age limit (1 h tier and series state), then backfill a slice. */
export function pruneMetricRollups(db: DatabaseSync, now: number, maxAgeMs: number): void {
  for (const t of TIERS) prepared(db, `DELETE FROM metric_${t.name} WHERE bucket_ms <= ?`).run(tierCutoff(t, now, t.keepMs ?? maxAgeMs));
  prepared(db, "DELETE FROM metric_series WHERE last_ms < ?").run(now - maxAgeMs);
  backfillMetricRollups(db, now);
}

const BACKFILL = "metric_backfill";
const BACKFILL_ROWS = 5_000;

/** Raw points up to rowid `upto` were stored before metric rollups; `states` is the backfill's own series state. */
interface Backfill {
  upto: number;
  after: number;
  states: Record<string, MetricState | null>;
}

const setMeta = (db: DatabaseSync, value: string) => prepared(db, "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(BACKFILL, value);

/** The backfill in progress. A file whose series already have rollups, or that has no points, needs none. */
function backfillJob(db: DatabaseSync): Backfill | null {
  const row = prepared(db, "SELECT value FROM meta WHERE key = ?").get(BACKFILL) as { value: string } | undefined;
  if (row) return row.value === "done" ? null : (JSON.parse(row.value) as Backfill);
  const live = prepared(db, "SELECT 1 AS x FROM metric_series LIMIT 1").get() !== undefined;
  const max = (prepared(db, "SELECT max(rowid) AS m FROM metrics").get() as { m: number | null }).m;
  if (!live && max !== null) return { upto: max, after: 0, states: {} };
  setMeta(db, "done");
  return null;
}

/** Roll up one slice of old raw points, per scope, carrying the backfill's own series state between slices. */
function backfillSlice(db: DatabaseSync, rows: { project: string; env: string; json: string }[], job: Backfill, now: number): void {
  const scopes = new Map<string, MetricPoint[]>();
  for (const r of rows) {
    const key = `${r.project}${r.env}`;
    const list = scopes.get(key) ?? [];
    scopes.set(key, list);
    list.push(JSON.parse(r.json) as MetricPoint);
  }
  for (const [scope, points] of scopes) {
    const [project = "", env = ""] = scope.split("");
    const groups = groupMetricSeries(points, metricKeyOf);
    const states = new Map([...groups.keys()].map((k) => [k, job.states[`${scope}${k}`] ?? null]));
    for (const w of writeMetricGroups(db, project, env, groups, states, now, metricSeriesInsertSql("sqlite", 1))) job.states[`${scope}${w.key}`] = w.state;
  }
}

/** Hub files from before metric rollups: roll up their raw points, oldest first, for at most `budgetMs` per call. */
export function backfillMetricRollups(db: DatabaseSync, now: number, budgetMs = 500): void {
  const job = backfillJob(db);
  if (!job) return;
  const end = Date.now() + budgetMs;
  const next = prepared(db, "SELECT rowid AS id, project, env, json FROM metrics WHERE rowid > ? AND rowid <= ? ORDER BY rowid LIMIT ?");
  while (Date.now() < end) {
    const rows = next.all(job.after, job.upto, BACKFILL_ROWS) as { id: number; project: string; env: string; json: string }[];
    if (rows.length === 0) return void setMeta(db, "done");
    backfillSlice(db, rows, job, now);
    job.after = rows.at(-1)!.id;
  }
  setMeta(db, JSON.stringify(job));
}
