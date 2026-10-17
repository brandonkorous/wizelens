// SQL text for metric rollups, for Postgres ($n) and SQLite (?). Hosts run it; sql-read.ts turns the rows into MetricData.
import type { Segment, Tier } from "../scale/window.js";
import type { TimeWindow } from "../stats/common.js";
import type { MetricPlacement } from "./from-rollups.js";

export type MetricDialect = "pg" | "sqlite";

export interface MetricSql {
  sql: string;
  args: unknown[];
}

/** Which rows: project and env (each optional on the hub), one service, some metric names. */
export interface MetricSqlScope {
  project?: string;
  env?: string;
  service?: string;
  names?: readonly string[];
}

/** MetricPlaceholders in the order they appear in the text, which SQLite needs. */
class Args {
  readonly list: unknown[] = [];
  constructor(readonly d: MetricDialect) {}
  p(v: unknown): string {
    this.list.push(v);
    return this.d === "pg" ? `$${this.list.length}` : "?";
  }
  in(col: string, vals: readonly unknown[]): string {
    return this.d === "pg" ? `${col} = ANY(${this.p(vals)})` : `${col} IN (SELECT value FROM json_each(${this.p(JSON.stringify(vals))}))`;
  }
}

export const metricProjectColumn = (d: MetricDialect): string => (d === "pg" ? "project_id" : "project");
export const metricTable = (t: Tier): string => `metric_${t.name}`;

function scopeWhere(a: Args, s: MetricSqlScope): string[] {
  const pc = metricProjectColumn(a.d);
  const out: string[] = [];
  if (s.project !== undefined) out.push(`${pc} = ${a.p(s.project)}`);
  if (s.env !== undefined) out.push(`env = ${a.p(s.env)}`);
  if (s.names) out.push(a.in("name", s.names));
  if (s.service !== undefined) {
    const service = a.p(s.service);
    const own = s.project !== undefined ? ` AND ${pc} = ${a.p(s.project)}` : "";
    out.push(`series_key IN (SELECT series_key FROM metric_series WHERE service = ${service}${own})`);
  }
  return out;
}

const KEYS = (d: MetricDialect) => `${metricProjectColumn(d)} AS project, env, series_key`;
const SUMMED = ["cnt", "vsum", "rate_delta", "rate_ms"];
const AGG = "SUM(cnt) AS cnt, SUM(vsum) AS vsum, MIN(vmin) AS vmin, MAX(vmax) AS vmax, MIN(first_ms) AS first_ms, MAX(last_ms) AS last_ms, SUM(rate_delta) AS rate_delta, SUM(rate_ms) AS rate_ms";

/** One segment of the window's totals; partial edge buckets scale the sums by their weight. */
function segmentBranch(a: Args, s: Segment, scope: MetricSqlScope, ends: boolean): string {
  // A literal, not a placeholder: SQLite needs one value per "?", and the weight is used once per summed column.
  const w = s.weight === 1 ? "" : ` * ${Number(s.weight).toString()}`;
  const cols = ends ? "first_ms, first_v, last_ms, last_v" : `${SUMMED.map((c) => `${c}${w} AS ${c}`).join(", ")}, vmin, vmax, first_ms, last_ms`;
  const where = [...scopeWhere(a, scope), `bucket_ms >= ${a.p(s.from)}`, `bucket_ms < ${a.p(s.to)}`];
  return `SELECT ${KEYS(a.d)}, ${cols} FROM ${metricTable(s.tier)} WHERE ${where.join(" AND ")}`;
}

const union = (a: Args, segments: readonly Segment[], scope: MetricSqlScope, ends: boolean) => segments.map((s) => segmentBranch(a, s, scope, ends)).join(" UNION ALL ");

/** Per series over the window: sums and extremes, joined with the series' name, kind, unit, and attributes. */
export function metricTotalsSql(d: MetricDialect, scope: MetricSqlScope, segments: readonly Segment[]): MetricSql | null {
  if (segments.length === 0) return null;
  const a = new Args(d);
  const inner = `SELECT project, env, series_key, ${AGG} FROM (${union(a, segments, scope, false)}) u GROUP BY project, env, series_key HAVING SUM(cnt) > 0`;
  const meta = "s.name, s.service, s.kind, s.unit, s.description, s.monotonic, s.temporality, s.attributes";
  const cols = "t.cnt, t.vsum, t.vmin, t.vmax, t.first_ms, t.last_ms, t.rate_delta, t.rate_ms";
  const join = `s.${metricProjectColumn(d)} = t.project AND s.env = t.env AND s.series_key = t.series_key`;
  const sql = `SELECT t.project, t.env, t.series_key, ${meta}, ${cols} FROM (${inner}) t JOIN metric_series s ON ${join} ORDER BY t.project, t.env, t.series_key`;
  return { sql, args: a.list };
}

/** Per series, the oldest and the newest bucket's first and last values (rf = 1 and rl = 1). */
export function metricEndsSql(d: MetricDialect, scope: MetricSqlScope, segments: readonly Segment[]): MetricSql | null {
  if (segments.length === 0) return null;
  const a = new Args(d);
  const part = "PARTITION BY project, env, series_key";
  const ranked = `SELECT project, env, series_key, first_ms, first_v, last_ms, last_v, ROW_NUMBER() OVER (${part} ORDER BY first_ms) AS rf,
    ROW_NUMBER() OVER (${part} ORDER BY last_ms DESC) AS rl FROM (${union(a, segments, scope, true)}) u`;
  return { sql: `SELECT project, env, series_key, first_ms, first_v, last_ms, last_v, rf, rl FROM (${ranked}) x WHERE rf = 1 OR rl = 1`, args: a.list };
}

/** Per series and page bucket (`b`): SQL assigns tier buckets by midpoint. In "split" mode, one row per tier bucket (`bucket_ms`). */
export function metricBucketsSql(d: MetricDialect, scope: MetricSqlScope, w: TimeWindow, n: number, plan: NonNullable<MetricPlacement>): MetricSql {
  const a = new Args(d);
  const table = metricTable(plan.tier);
  if (plan.mode === "split") {
    const where = [...scopeWhere(a, scope), `bucket_ms > ${a.p(w.from - plan.tier.ms)}`, `bucket_ms < ${a.p(w.to)}`];
    const cols = "cnt, vsum, vmin, vmax, first_ms, last_ms, rate_delta, rate_ms";
    return { sql: `SELECT ${KEYS(d)}, bucket_ms, ${cols} FROM ${table} WHERE ${where.join(" AND ")}`, args: a.list };
  }
  const half = plan.tier.ms / 2;
  const div = `(bucket_ms + ${a.p(half)} - ${a.p(w.from)}) / ${a.p((w.to - w.from) / n)}`;
  const b = d === "pg" ? `FLOOR(${div})` : `CAST(${div} AS INTEGER)`;
  const head = `SELECT ${KEYS(d)}, ${b} AS b, ${AGG} FROM ${table}`;
  const where = [...scopeWhere(a, scope), `bucket_ms + ${a.p(half)} >= ${a.p(w.from)}`, `bucket_ms + ${a.p(half)} < ${a.p(w.to)}`];
  return { sql: `${head} WHERE ${where.join(" AND ")} GROUP BY 1, 2, 3, 4`, args: a.list };
}

/** Tier buckets with histogram counts that touch the window; TS places and merges them. */
export function metricHistRowsSql(d: MetricDialect, scope: MetricSqlScope, w: TimeWindow, tier: Tier): MetricSql {
  const a = new Args(d);
  const where = [...scopeWhere(a, scope), "h_count > 0", `bucket_ms > ${a.p(w.from - tier.ms)}`, `bucket_ms < ${a.p(w.to)}`];
  const cols = "bucket_ms, h_count, h_sum, h_min, h_max, h_bounds, h_counts";
  return { sql: `SELECT ${KEYS(d)}, ${cols} FROM ${metricTable(tier)} WHERE ${where.join(" AND ")}`, args: a.list };
}

/** Bucket sums of gauge values in the window, for alert percentiles. */
export function metricGaugeValuesSql(d: MetricDialect, scope: MetricSqlScope, w: TimeWindow, tier: Tier): MetricSql {
  const a = new Args(d);
  const where = [...scopeWhere(a, scope), "vmin IS NOT NULL", `bucket_ms >= ${a.p(w.from)}`, `bucket_ms < ${a.p(w.to)}`];
  return { sql: `SELECT ${KEYS(d)}, vsum, cnt FROM ${metricTable(tier)} WHERE ${where.join(" AND ")}`, args: a.list };
}
