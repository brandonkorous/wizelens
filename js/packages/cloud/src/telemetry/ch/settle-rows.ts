// What one settle batch writes to ClickHouse: fact rows, tombstones for rows a trace no longer has, and rollup deltas.
import { FACT_COLUMNS, FACT_TABLES, type FactTable, IDS_MAX, isLooseTraceId, LOG_KINDS, NONE_HIGH, NONE_LOW, type RollupKind, type SettleDelta, TIERS } from "@wizeworks/lens-core/internal";
import { FACT_KEYS } from "./schema-facts.js";
import type { ChClient } from "./http.js";
import { type Keep, logKeepOf, rowOf } from "./util.js";

type Row = Record<string, unknown>;

const COUNTERS = ["c0", "c1", "c2", "c3", "c4", "c5"];
const keyCols = (t: FactTable) => FACT_KEYS[`${t}_t`]!;
const keyOf = (t: FactTable, r: Row) => [r.trace_id, ...keyCols(t).map((c) => r[c])].map((v) => JSON.stringify(v ?? null)).join("|");
/** What settle_state keeps of a row: its key, and for attributes their owner's time, so a tombstone takes the count from the right hour. */
const storedCols = (t: FactTable) => (t === "fact_attrs" ? [...keyCols(t), "time_ms"] : keyCols(t));
type StoredKeys = Partial<Record<FactTable, unknown[][]>>;
const storedRows = (t: FactTable, id: string, keys: StoredKeys) => (keys[t] ?? []).map((v) => rowOf(["trace_id", ...storedCols(t)], [id, ...v]));
const sameAttr = (r: Row) => `${keyOf("fact_attrs", r)}|${JSON.stringify(r.time_ms ?? null)}`;

/** How long a fact row is kept: log rows (lines, their search rows and attributes) by the log retention, the rest by the trace retention. */
export function factKeepOf(table: FactTable, r: Row, keep: Keep): number {
  const id = String(r.trace_id);
  const logRow = table === "fact_logs" || (table === "fact_search" && r.kind === "logs") || (table === "fact_attrs" && r.src === "l");
  return logRow ? logKeepOf(id, keep) : isLooseTraceId(id) ? keep.logMs : keep.ms;
}

/** Fact rows as objects, with their version and expiry. */
export function factObjects(rows: Record<FactTable, unknown[][]>, org: string, ver: number, expireOf: (r: Row, table: FactTable) => number): Record<FactTable, Row[]> {
  const out = {} as Record<FactTable, Row[]>;
  for (const t of FACT_TABLES) {
    const cols = ["project_id", ...FACT_COLUMNS[t]];
    out[t] = rows[t].map((values) => {
      const r = rowOf(cols, values);
      return { ...r, org_id: org, ver, is_deleted: 0, expire_ms: expireOf(r, t) };
    });
  }
  return out;
}

/** Attribute rows take their owner's time (its span's or log line's search row), for the hourly attribute counts, and expire from it. */
export function timeAttrs(facts: Record<FactTable, Row[]>, expireOf: (r: Row, table: FactTable) => number): void {
  const at = new Map(facts.fact_search.map((r) => [`${r.trace_id}|${r.kind}|${r.owner}`, Number(r.time_ms)]));
  for (const r of facts.fact_attrs) {
    const ms = at.get(`${r.trace_id}|${r.src === "l" ? "logs" : "spans"}|${r.owner}`);
    if (ms === undefined) continue;
    r.time_ms = ms;
    r.expire_ms = expireOf(r, "fact_attrs");
  }
}

/** Each trace's fact row keys, as settle_state keeps them (`{table: [[key values]]}`), so the next settle finds its old rows without a scan. */
export function factKeysOf(facts: Record<FactTable, Row[]>): Map<string, string> {
  const byTrace = new Map<string, Partial<Record<FactTable, unknown[][]>>>();
  for (const t of FACT_TABLES) {
    for (const r of facts[t]) {
      const id = String(r.trace_id);
      const keys = byTrace.get(id) ?? {};
      (keys[t] ??= []).push(storedCols(t).map((c) => r[c] ?? null));
      byTrace.set(id, keys);
    }
  }
  return new Map([...byTrace].map(([id, keys]) => [id, JSON.stringify(keys)]));
}

/** Old fact rows of traces settled before settle_state kept their keys: a scan, since fact tables are not ordered by trace. */
async function scannedKeys(ch: ChClient, project: string, t: FactTable, traceIds: readonly string[]): Promise<Row[]> {
  const cols = ["trace_id", ...storedCols(t)];
  const sql = `SELECT ${cols.join(", ")} FROM ${t}_t FINAL PREWHERE has({p2:Array(String)}, trace_id) WHERE project_id = {p1:String}`;
  return traceIds.length ? ch.query<Row>(sql, [project, traceIds]) : [];
}

/** Rows the re-settled traces had before and no longer have, as tombstones. `old` holds each re-settled trace's stored keys ("" when none were kept). */
export async function tombstones(ch: ChClient, project: { id: string; org: string }, old: ReadonlyMap<string, string>, fresh: Record<FactTable, Row[]>, ver: number): Promise<Record<FactTable, Row[]>> {
  const out = {} as Record<FactTable, Row[]>;
  const unkept = [...old].filter(([, keys]) => !keys).map(([id]) => id);
  const kept = [...old].filter(([, keys]) => keys).map(([id, keys]) => [id, JSON.parse(keys) as StoredKeys] as const);
  for (const t of FACT_TABLES) {
    const keep = new Set(fresh[t].map((r) => keyOf(t, r)));
    const stored = kept.flatMap(([id, keys]) => storedRows(t, id, keys));
    const before = [...stored, ...(await scannedKeys(ch, project.id, t, unkept))];
    out[t] = before.filter((r) => !keep.has(keyOf(t, r))).map((r) => ({ project_id: project.id, org_id: project.org, ...r, ver, is_deleted: 1, expire_ms: NONE_HIGH }));
  }
  return out;
}

/** Fresh attribute rows less those the trace already has, unchanged: written again, the attribute counts would take them twice. */
export function newAttrs(old: ReadonlyMap<string, string>, fresh: readonly Row[]): Row[] {
  const had = new Set([...old].flatMap(([id, keys]) => (keys ? storedRows("fact_attrs", id, JSON.parse(keys) as StoredKeys).map(sameAttr) : [])));
  return fresh.filter((r) => !had.has(sameAttr(r)));
}

const ROLLUP_INPUT = [
  "project_id String, org_id String, env String, kind String, key String, bucket_ms Float64, n Float64, err Float64, sum_v Float64",
  ...COUNTERS.map((c) => `${c} Float64`),
  "first_ms Float64, last_ms Float64, top_rank Float64, top Nullable(String), ids String, expire_ms Float64",
].join(", ");

/** Deltas add into the merge tables; a batch's deltas for one bucket and key become one row. `org_id` is the table's last column. */
function rollupInsert(table: string): string {
  const sums = ["n", "err", "sum_v", ...COUNTERS].map((c) => `sum(${c})`).join(", ");
  const ids = `groupArraySortedArrayState(${IDS_MAX})(arrayMap(x -> (-last_ms, x), arrayFilter(x -> x != '', splitByChar(' ', ids))))`;
  return `${table}_t SELECT project_id, env, kind, key, bucket_ms, ${sums}, min(first_ms), max(last_ms), max(top_rank), argMaxState(top, top_rank), ${ids}, max(expire_ms), any(org_id)
    FROM input('${ROLLUP_INPUT}') GROUP BY project_id, env, kind, key, bucket_ms`;
}

const HIST_INPUT = "project_id String, org_id String, env String, kind String, key String, bucket_ms Float64, bin Int32, cnt Float64, expire_ms Float64";
const histInsert = (table: string) =>
  `${table}_t SELECT project_id, env, kind, key, bucket_ms, bin, sum(cnt), max(expire_ms), any(org_id) FROM input('${HIST_INPUT}') GROUP BY project_id, env, kind, key, bucket_ms, bin`;

/** Settings that make one batch's insert into a table safe to send again: ClickHouse keeps the first copy of a token. */
export type Label = (table: string) => Record<string, string>;

/** Write a merged settle delta into every tier. Rows expire by their project's retention; log kinds by its log retention. */
export async function writeDeltas(ch: ChClient, delta: SettleDelta, keepOf: (project: string) => Keep, label: Label, org: string): Promise<void> {
  const ms = (project: string, kind: RollupKind) => (LOG_KINDS.has(kind) ? keepOf(project).logMs : keepOf(project).ms);
  const writes: Promise<void>[] = [];
  for (const tier of TIERS) {
    const rollups = delta.rollup.filter((r) => r.tier === tier.name).map((r) => ({
      project_id: r.project, org_id: org, env: r.env, kind: r.kind, key: r.key, bucket_ms: r.bucket, n: r.n, err: r.err, sum_v: r.sum,
      ...Object.fromEntries(COUNTERS.map((c, i) => [c, r.c[i] ?? 0])), first_ms: r.firstMs ?? NONE_HIGH, last_ms: r.lastMs ?? NONE_LOW,
      top_rank: r.topRank ?? NONE_LOW, top: r.topRank === null ? null : JSON.stringify(r.top ?? null), ids: r.ids, expire_ms: r.bucket + ms(r.project, r.kind),
    }));
    const hists = delta.hist.filter((h) => h.tier === tier.name).map((h) => ({
      project_id: h.project, org_id: org, env: h.env, kind: h.kind, key: h.key, bucket_ms: h.bucket, bin: h.bin, cnt: h.cnt, expire_ms: h.bucket + ms(h.project, h.kind),
    }));
    writes.push(ch.insert(rollupInsert(tier.table), rollups, label(tier.table)), ch.insert(histInsert(tier.hist), hists, label(tier.hist)));
  }
  await Promise.all(writes);
}
