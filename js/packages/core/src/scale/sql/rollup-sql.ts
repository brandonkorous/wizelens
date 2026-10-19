// Rollup reads: groups (totals per key over the planned tier segments) and series (per page bucket), shaped like the memory executor's.
import type { TimeWindow } from "../../stats/common.js";
import { type Agg, emptyAgg, trimAgg } from "../agg.js";
import { KEY_SEP, KIND_SPEC, type KindSpec, type RollupKind } from "../kinds.js";
import type { AggOrder, GroupNeed, GroupRows, KeyFilter, SeriesNeed, SeriesRows } from "../needs.js";
import { planSeries, planTotals, type Segment, spreadBucket, type Tier } from "../window.js";
import { collate, floorOf, lit, msLit, num, type SqlSource, SqlText, scopeWhere } from "./dialect.js";
import { idsOfText } from "./write-sql.js";

const COUNTERS = ["c0", "c1", "c2", "c3", "c4", "c5"];
const VALUES = ["n", "err", "sum_v", ...COUNTERS];
const IDS_BUCKETS = 3;

type Row = Record<string, unknown>;

/** Conditions on a rollup or hist table for the scope, the kind, and the key filter. */
function kindWhere(q: SqlText, src: SqlSource, kind: RollupKind, f: KeyFilter | undefined): string[] {
  const out = [...scopeWhere(q, src.scope), `kind = ${q.p(kind)}`];
  if (f?.prefix !== undefined) out.push(q.startsWith("key", f.prefix));
  if (f?.keys) out.push(q.in("key", f.keys));
  if (f?.parts) {
    const pieces = f.parts.flatMap((p, i) => (i ? [KEY_SEP, p] : [p]));
    out.push(q.matches("key", pieces), `length(key) - length(replace(key, ${q.p(KEY_SEP)}, '')) = ${lit(f.parts.length - 1)}`);
  }
  return out;
}

interface Branches {
  segs: readonly Segment[];
  table: (t: Tier) => string;
  cols: (weight: number) => string;
  /** Extra conditions, built per branch so parameters stay in text order. */
  extra: (q: SqlText) => string[];
}

/** One UNION ALL branch per segment. */
function branches(q: SqlText, src: SqlSource, need: GroupNeed, b: Branches): string {
  return b.segs
    .map((s) => {
      const cols = b.cols(s.weight);
      const where = [...kindWhere(q, src, need.kind, need.filter), ...b.extra(q), `bucket_ms >= ${msLit(q.d, s.from)}`, `bucket_ms < ${msLit(q.d, s.to)}`];
      return `SELECT ${cols} FROM ${b.table(s.tier)} WHERE ${where.join(" AND ")}`;
    })
    .join(" UNION ALL ");
}

const weighted = (cols: readonly string[], w: number) => cols.map((c) => (w === 1 ? c : `${c} * ${lit(w)} AS ${c}`)).join(", ");

function orderExpr(by: AggOrder): string {
  if (by === "avg") return "SUM(sum_v) / SUM(n)";
  if (by === "lastMs") return "MAX(last_ms)";
  return `SUM(${by === "sum" ? "sum_v" : by})`;
}

function totalsSql(q: SqlText, src: SqlSource, need: GroupNeed, segs: readonly Segment[], ordered: boolean): string {
  const inner = branches(q, src, need, { segs, table: (t) => t.table, cols: (w) => `key, ${weighted(VALUES, w)}, first_ms, last_ms`, extra: () => ["n > 0.5"] });
  const sums = VALUES.map((c) => `SUM(${c}) AS ${c}`).join(", ");
  const o = ordered ? need.order : undefined;
  const limit = o && Number.isFinite(o.limit) ? ` LIMIT ${lit(Math.max(0, Math.floor(o.limit)))}` : "";
  const order = o ? ` ORDER BY ${orderExpr(o.by)} ${o.desc ? "DESC" : "ASC"}, ${collate(src.d, "key")}${limit}` : "";
  return `SELECT key, ${sums}, MIN(first_ms) AS first_ms, MAX(last_ms) AS last_ms, COUNT(*) OVER () AS total FROM (${inner}) s GROUP BY key HAVING SUM(n) > 0.5${order}`;
}

/** A group row as the memory executor trims it: extras only when asked for. */
function groupAgg(r: Row, spec: KindSpec, need: GroupNeed, rounded: boolean): Agg {
  const whole = (v: number, i: number) => (rounded && (i < 0 || spec.ints.includes(i)) ? Math.round(v) : v);
  const a = emptyAgg(!!need.hist && spec.hist);
  a.n = whole(num(r.n), -1);
  a.err = whole(num(r.err), -1);
  a.sum = num(r.sum_v);
  a.c = COUNTERS.map((c, i) => whole(num(r[c]), i));
  a.firstMs = num(r.first_ms);
  a.lastMs = num(r.last_ms);
  return trimAgg(a, { hist: need.hist, times: true });
}

async function addHists(src: SqlSource, need: GroupNeed, segs: readonly Segment[], rows: GroupRows["rows"], keys: string[] | null): Promise<void> {
  const q = new SqlText(src.d);
  const extra = (x: SqlText) => (keys ? [x.in("key", keys)] : []);
  const inner = branches(q, src, need, { segs, table: (t) => t.hist, cols: (w) => `key, bin, ${weighted(["cnt"], w)}`, extra });
  const byKey = new Map(rows.map((r) => [r.key, r.agg]));
  for (const h of await src.run.all(`SELECT key, bin, SUM(cnt) AS cnt FROM (${inner}) s GROUP BY key, bin`, q.params)) {
    const a = byKey.get(String(h.key));
    const cnt = num(h.cnt);
    if (a?.hist && Math.abs(cnt) > 1e-9) a.hist[num(h.bin)] = cnt;
  }
}

/** Ranked rows per key over the segments: the best top, or the newest buckets' ids. */
async function rankedRows(src: SqlSource, need: GroupNeed, segs: readonly Segment[], keys: string[] | null, what: "top" | "ids"): Promise<Row[]> {
  const q = new SqlText(src.d);
  const cols = what === "top" ? "key, top, top_rank, last_ms" : "key, ids, last_ms";
  const has = what === "top" ? "top IS NOT NULL" : "ids <> ''";
  const extra = (x: SqlText) => ["n > 0.5", has, ...(keys ? [x.in("key", keys)] : [])];
  const inner = branches(q, src, need, { segs, table: (t) => t.table, cols: () => cols, extra });
  const rank = what === "top" ? "top_rank DESC, last_ms DESC" : "last_ms DESC";
  const keep = what === "top" ? "rn = 1" : `rn <= ${IDS_BUCKETS}`;
  const sql = `SELECT * FROM (SELECT ${cols}, ROW_NUMBER() OVER (PARTITION BY key ORDER BY ${rank}) AS rn FROM (${inner}) s) t WHERE ${keep}`;
  return src.run.all(sql, q.params);
}

async function addTops(src: SqlSource, need: GroupNeed, segs: readonly Segment[], rows: GroupRows["rows"], keys: string[] | null): Promise<void> {
  const byKey = new Map(rows.map((r) => [r.key, r.agg]));
  for (const t of await rankedRows(src, need, segs, keys, "top")) {
    const a = byKey.get(String(t.key));
    if (!a) continue;
    a.top = parseTop(t.top);
    a.topRank = a.top === null ? 0 : num(t.top_rank);
  }
}

async function addIds(src: SqlSource, need: GroupNeed, segs: readonly Segment[], rows: GroupRows["rows"], keys: string[] | null): Promise<void> {
  const ranked = (await rankedRows(src, need, segs, keys, "ids")).sort((a, b) => num(a.rn) - num(b.rn));
  const cap = KIND_SPEC[need.kind].ids;
  const byKey = new Map(rows.map((r) => [r.key, r.agg]));
  for (const r of ranked) {
    const a = byKey.get(String(r.key));
    if (a) a.ids = [...new Set([...a.ids, ...idsOfText(String(r.ids))])].slice(0, cap);
  }
}

function parseTop(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(String(v)) as unknown;
  } catch {
    return null;
  }
}

const byKeyOrder = (x: { key: string }, y: { key: string }) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0);

/** Groups of one kind over a window, from the tier segments that cover it. */
export async function groupsSql(src: SqlSource, need: GroupNeed, w: TimeWindow, now: number, retentionMs: number): Promise<GroupRows> {
  const spec = KIND_SPEC[need.kind];
  const segs = planTotals(w, now, retentionMs);
  if (!segs.length) return { rows: [], total: 0 };
  const q = new SqlText(src.d);
  const found = await src.run.all(totalsSql(q, src, need, segs, need.order?.limit !== 0), q.params);
  const rounded = segs.some((s) => s.weight < 1);
  const all = found.map((r) => ({ key: String(r.key), agg: groupAgg(r, spec, need, rounded) }));
  const total = found.length ? num(found[0]!.total) : 0;
  const rows = need.order ? (need.order.limit === 0 ? [] : all) : all.sort(byKeyOrder);
  const keys = rows.length < total ? rows.map((r) => r.key) : null;
  if (rows.length && need.hist && spec.hist) await addHists(src, need, segs, rows, keys);
  if (rows.length && need.top && spec.top) await addTops(src, need, segs, rows, keys);
  if (rows.length && need.ids && spec.ids > 0) await addIds(src, need, segs, rows, keys);
  return { rows, total };
}

interface SeriesPlan {
  tier: Tier;
  mode: "sql" | "split";
}

/** Series rows per key and bucket: page bucket index ("sql") or tier bucket start ("split"). */
function seriesSql(q: SqlText, src: SqlSource, need: SeriesNeed, w: TimeWindow, plan: SeriesPlan, hist: boolean): string {
  const t = plan.tier;
  const half = t.ms / 2;
  const key = need.split ? "key, " : "";
  const b = plan.mode === "sql" ? floorOf(src.d, `((bucket_ms + ${lit(half)} - ${lit(w.from)}) / ${lit(w.to - w.from)}) * ${lit(need.buckets)}`) : "bucket_ms";
  const range = plan.mode === "sql"
    ? [`bucket_ms + ${lit(half)} >= ${lit(w.from)}`, `bucket_ms + ${lit(half)} < ${lit(w.to)}`]
    : [`bucket_ms > ${msLit(q.d, w.from - t.ms)}`, `bucket_ms < ${msLit(q.d, w.to)}`];
  const cols = hist ? ["bin", "cnt"] : VALUES;
  const where = [...kindWhere(q, src, need.kind, need.filter), ...(hist ? [] : ["n > 0.5"]), ...range];
  const inner = `SELECT ${key}${b} AS b, ${cols.join(", ")} FROM ${hist ? t.hist : t.table} WHERE ${where.join(" AND ")}`;
  const sums = hist ? "bin, SUM(cnt) AS cnt" : VALUES.map((c) => `SUM(${c}) AS ${c}`).join(", ");
  return `SELECT ${key}b, ${sums} FROM (${inner}) s GROUP BY ${key}b${hist ? ", bin" : ""}`;
}

/** Where a row lands: one page bucket, or its overlap with each. */
function targetsOf(r: Row, plan: SeriesPlan, w: TimeWindow, buckets: number): { index: number; share: number }[] {
  if (plan.mode === "split") return spreadBucket(num(r.b), plan.tier.ms, w, buckets);
  const i = num(r.b);
  return i >= 0 ? [{ index: Math.min(buckets - 1, i), share: 1 }] : [];
}

function addRow(a: Agg, r: Row, share: number): void {
  a.n += num(r.n) * share;
  a.err += num(r.err) * share;
  a.sum += num(r.sum_v) * share;
  COUNTERS.forEach((c, i) => (a.c[i] = a.c[i]! + num(r[c]) * share));
}

/** A kind per page bucket, summed over keys or per key, like the memory executor. */
export async function seriesSqlRows(src: SqlSource, need: SeriesNeed, w: TimeWindow, now: number, retentionMs: number): Promise<SeriesRows> {
  const spec = KIND_SPEC[need.kind];
  const fresh = () => Array.from({ length: need.buckets }, () => trimAgg(emptyAgg(spec.hist), { hist: need.hist, times: false }));
  const byKey: Record<string, Agg[]> = need.split ? {} : { "": fresh() };
  if (w.to <= w.from) return { byKey };
  const plan = planSeries(w, need.buckets, now, retentionMs);
  const q = new SqlText(src.d);
  for (const r of await src.run.all(seriesSql(q, src, need, w, plan, false), q.params)) {
    const targets = targetsOf(r, plan, w, need.buckets);
    if (!targets.length) continue;
    const list = (byKey[need.split ? String(r.key) : ""] ??= fresh());
    for (const t of targets) addRow(list[t.index]!, r, t.share);
  }
  if (need.hist && spec.hist) await addSeriesHists(src, need, w, plan, byKey);
  return { byKey };
}

async function addSeriesHists(src: SqlSource, need: SeriesNeed, w: TimeWindow, plan: SeriesPlan, byKey: Record<string, Agg[]>): Promise<void> {
  const q = new SqlText(src.d);
  for (const r of await src.run.all(seriesSql(q, src, need, w, plan, true), q.params)) {
    const list = byKey[need.split ? String(r.key) : ""];
    for (const t of list ? targetsOf(r, plan, w, need.buckets) : []) {
      const h = list![t.index]!.hist!;
      const bin = num(r.bin);
      const cnt = (h[bin] ?? 0) + num(r.cnt) * t.share;
      if (Math.abs(cnt) > 1e-9) h[bin] = cnt;
      else delete h[bin];
    }
  }
}
