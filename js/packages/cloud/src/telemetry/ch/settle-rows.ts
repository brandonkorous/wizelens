// What one settle batch writes to ClickHouse: fact rows, tombstones for rows a trace no longer has, and rollup deltas.
import { FACT_COLUMNS, FACT_TABLES, type FactTable, IDS_MAX, isLooseTraceId, LOG_KINDS, NONE_HIGH, NONE_LOW, type RollupKind, type SettleDelta, TIERS } from "@wizeworks/lens-core";
import { FACT_KEYS } from "./schema-facts.js";
import type { ChClient } from "./http.js";
import { type Keep, logKeepOf, rowOf } from "./util.js";

type Row = Record<string, unknown>;

const COUNTERS = ["c0", "c1", "c2", "c3", "c4", "c5"];
const keyCols = (t: FactTable) => FACT_KEYS[`${t}_t`]!;
const keyOf = (t: FactTable, r: Row) => [r.trace_id, ...keyCols(t).map((c) => r[c])].map((v) => JSON.stringify(v ?? null)).join("|");

/** How long a fact row is kept: log rows (lines, their search rows and attributes) by the log retention, the rest by the trace retention. */
export function factKeepOf(table: FactTable, r: Row, keep: Keep): number {
  const id = String(r.trace_id);
  const logRow = table === "fact_logs" || (table === "fact_search" && r.kind === "logs") || (table === "fact_attrs" && r.src === "l");
  return logRow ? logKeepOf(id, keep) : isLooseTraceId(id) ? keep.logMs : keep.ms;
}

/** Fact rows as objects, with their version and expiry. */
export function factObjects(rows: Record<FactTable, unknown[][]>, ver: number, expireOf: (r: Row, table: FactTable) => number): Record<FactTable, Row[]> {
  const out = {} as Record<FactTable, Row[]>;
  for (const t of FACT_TABLES) {
    const cols = ["project_id", ...FACT_COLUMNS[t]];
    out[t] = rows[t].map((values) => {
      const r = rowOf(cols, values);
      return { ...r, ver, is_deleted: 0, expire_ms: expireOf(r, t) };
    });
  }
  return out;
}

/** Rows the re-settled traces had before and no longer have, as tombstones. Only traces settled before can have any. */
export async function tombstones(ch: ChClient, project: string, traceIds: readonly string[], fresh: Record<FactTable, Row[]>, ver: number): Promise<Record<FactTable, Row[]>> {
  const out = {} as Record<FactTable, Row[]>;
  for (const t of FACT_TABLES) {
    out[t] = [];
    if (!traceIds.length) continue;
    const cols = ["trace_id", ...keyCols(t)];
    const sql = `SELECT ${cols.join(", ")} FROM ${t}_t FINAL WHERE project_id = {p1:String} AND has({p2:Array(String)}, trace_id)`;
    const keep = new Set(fresh[t].map((r) => keyOf(t, r)));
    for (const old of await ch.query<Row>(sql, [project, traceIds])) {
      if (!keep.has(keyOf(t, old))) out[t].push({ project_id: project, ...old, ver, is_deleted: 1, expire_ms: NONE_HIGH });
    }
  }
  return out;
}

const ROLLUP_INPUT = [
  "project_id String, env String, kind String, key String, bucket_ms Float64, n Float64, err Float64, sum_v Float64",
  ...COUNTERS.map((c) => `${c} Float64`),
  "first_ms Float64, last_ms Float64, top_rank Float64, top Nullable(String), ids String, expire_ms Float64",
].join(", ");

/** Deltas add into the merge tables; a batch's deltas for one bucket and key become one row. */
function rollupInsert(table: string): string {
  const sums = ["n", "err", "sum_v", ...COUNTERS].map((c) => `sum(${c})`).join(", ");
  const ids = `groupArraySortedArrayState(${IDS_MAX})(arrayMap(x -> (-last_ms, x), arrayFilter(x -> x != '', splitByChar(' ', ids))))`;
  return `${table}_t SELECT project_id, env, kind, key, bucket_ms, ${sums}, min(first_ms), max(last_ms), max(top_rank), argMaxState(top, top_rank), ${ids}, max(expire_ms)
    FROM input('${ROLLUP_INPUT}') GROUP BY project_id, env, kind, key, bucket_ms`;
}

const HIST_INPUT = "project_id String, env String, kind String, key String, bucket_ms Float64, bin Int32, cnt Float64, expire_ms Float64";
const histInsert = (table: string) =>
  `${table}_t SELECT project_id, env, kind, key, bucket_ms, bin, sum(cnt), max(expire_ms) FROM input('${HIST_INPUT}') GROUP BY project_id, env, kind, key, bucket_ms, bin`;

/** Settings that make one batch's insert into a table safe to send again: ClickHouse keeps the first copy of a token. */
export type Label = (table: string) => Record<string, string>;

/** Write a merged settle delta into every tier. Rows expire by their project's retention; log kinds by its log retention. */
export async function writeDeltas(ch: ChClient, delta: SettleDelta, keepOf: (project: string) => Keep, label: Label): Promise<void> {
  const ms = (project: string, kind: RollupKind) => (LOG_KINDS.has(kind) ? keepOf(project).logMs : keepOf(project).ms);
  const writes: Promise<void>[] = [];
  for (const tier of TIERS) {
    const rollups = delta.rollup.filter((r) => r.tier === tier.name).map((r) => ({
      project_id: r.project, env: r.env, kind: r.kind, key: r.key, bucket_ms: r.bucket, n: r.n, err: r.err, sum_v: r.sum,
      ...Object.fromEntries(COUNTERS.map((c, i) => [c, r.c[i] ?? 0])), first_ms: r.firstMs ?? NONE_HIGH, last_ms: r.lastMs ?? NONE_LOW,
      top_rank: r.topRank ?? NONE_LOW, top: r.topRank === null ? null : JSON.stringify(r.top ?? null), ids: r.ids, expire_ms: r.bucket + ms(r.project, r.kind),
    }));
    const hists = delta.hist.filter((h) => h.tier === tier.name).map((h) => ({
      project_id: h.project, env: h.env, kind: h.kind, key: h.key, bucket_ms: h.bucket, bin: h.bin, cnt: h.cnt, expire_ms: h.bucket + ms(h.project, h.kind),
    }));
    writes.push(ch.insert(rollupInsert(tier.table), rollups, label(tier.table)), ch.insert(histInsert(tier.hist), hists, label(tier.hist)));
  }
  await Promise.all(writes);
}
