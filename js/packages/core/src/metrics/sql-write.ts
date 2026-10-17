// SQL text for writing metric rollups at ingest, for Postgres ($n) and SQLite (?): tier upserts and series state.
import type { Tier } from "../scale/window.js";
import { type MetricDialect, metricTable, metricProjectColumn, type MetricSql } from "./sql.js";

export const METRIC_TIER_COLUMNS = [
  "project", "env", "series_key", "name", "bucket_ms", "cnt", "vsum", "vmin", "vmax", "first_ms", "first_v", "last_ms", "last_v",
  "rate_delta", "rate_ms", "h_count", "h_sum", "h_min", "h_max", "h_bounds", "h_counts",
] as const;

export const METRIC_SERIES_COLUMNS = [
  "project", "env", "series_key", "name", "service", "kind", "unit", "description", "monotonic", "temporality", "attributes",
  "last_ms", "last_value", "last_hist",
] as const;

const columns = (d: MetricDialect, list: readonly string[]) => list.map((c) => (c === "project" ? metricProjectColumn(d) : c)).join(", ");

/** "(?, ?), (?, ?)" or "($1, $2), ($3, $4)" for `rows` rows of `width` values. */
export function metricValuesList(d: MetricDialect, rows: number, width: number): string {
  const one = (r: number) => `(${Array.from({ length: width }, (_, c) => (d === "pg" ? `$${r * width + c + 1}` : "?")).join(", ")})`;
  return Array.from({ length: rows }, (_, r) => one(r)).join(", ");
}

/** Sums add, extremes keep the extremes, first and last follow time, histogram counts are written whole (merged in TS). */
export function metricTierUpsertSql(d: MetricDialect, tier: Tier, rows: number): string {
  const t = metricTable(tier);
  const [lo, hi] = d === "pg" ? ["LEAST", "GREATEST"] : ["min", "max"];
  const add = (c: string) => `${c} = ${t}.${c} + excluded.${c}`;
  const pick = (f: string, c: string) => `${c} = ${f}(COALESCE(${t}.${c}, excluded.${c}), COALESCE(excluded.${c}, ${t}.${c}))`;
  const hist = (c: string) => `${c} = CASE WHEN excluded.h_count > 0 THEN excluded.${c} ELSE ${t}.${c} END`;
  const set = [
    ...["cnt", "vsum", "rate_delta", "rate_ms", "h_count", "h_sum"].map(add),
    pick(lo, "vmin"), pick(hi, "vmax"), pick(lo, "h_min"), pick(hi, "h_max"),
    `first_v = CASE WHEN excluded.first_ms < ${t}.first_ms THEN excluded.first_v ELSE ${t}.first_v END`,
    `first_ms = ${lo}(${t}.first_ms, excluded.first_ms)`,
    `last_v = CASE WHEN excluded.last_ms >= ${t}.last_ms THEN excluded.last_v ELSE ${t}.last_v END`,
    `last_ms = ${hi}(${t}.last_ms, excluded.last_ms)`,
    hist("h_bounds"), hist("h_counts"),
  ];
  const key = `${metricProjectColumn(d)}, name, bucket_ms, env, series_key`;
  return `INSERT INTO ${t} (${columns(d, METRIC_TIER_COLUMNS)}) VALUES ${metricValuesList(d, rows, METRIC_TIER_COLUMNS.length)} ON CONFLICT (${key}) DO UPDATE SET ${set.join(", ")}`;
}

/** The series rows: what the series is, from its newest point, and its state (worked out in TS under a lock). */
export function metricSeriesUpsertSql(d: MetricDialect, rows: number): string {
  const set = METRIC_SERIES_COLUMNS.slice(3).map((c) => `${c} = excluded.${c}`).join(", ");
  const head = `INSERT INTO metric_series (${columns(d, METRIC_SERIES_COLUMNS)}) VALUES ${metricValuesList(d, rows, METRIC_SERIES_COLUMNS.length)}`;
  return `${head} ON CONFLICT (${metricProjectColumn(d)}, env, series_key) DO UPDATE SET ${set}`;
}

/** Series rows only where none exist: placeholders that let Postgres lock every series of a batch, and hub backfills. */
export function metricSeriesInsertSql(d: MetricDialect, rows: number): string {
  return `INSERT INTO metric_series (${columns(d, METRIC_SERIES_COLUMNS)}) VALUES ${metricValuesList(d, rows, METRIC_SERIES_COLUMNS.length)} ON CONFLICT DO NOTHING`;
}

/** The stored state of some series. Postgres locks them, in key order, until the transaction ends. */
export function metricStateSql(d: MetricDialect, project: string, env: string, keys: readonly string[]): MetricSql {
  const pc = metricProjectColumn(d);
  const cols = "series_key, last_ms, last_value, last_hist";
  if (d === "pg") return { sql: `SELECT ${cols} FROM metric_series WHERE ${pc} = $1 AND env = $2 AND series_key = ANY($3) ORDER BY series_key FOR UPDATE`, args: [project, env, keys] };
  return { sql: `SELECT ${cols} FROM metric_series WHERE ${pc} = ? AND env = ? AND series_key IN (SELECT value FROM json_each(?))`, args: [project, env, JSON.stringify(keys)] };
}

/** Stored histogram counts of some tier buckets (a superset: every key with every bucket), locked on Postgres. */
export function metricHistStateSql(d: MetricDialect, tier: Tier, project: string, env: string, keys: readonly string[], buckets: readonly number[]): MetricSql {
  const pc = metricProjectColumn(d);
  const cols = "series_key, bucket_ms, h_count, h_sum, h_min, h_max, h_bounds, h_counts";
  const t = metricTable(tier);
  if (d === "pg") {
    const where = `${pc} = $1 AND env = $2 AND series_key = ANY($3) AND bucket_ms = ANY($4) AND h_count > 0`;
    return { sql: `SELECT ${cols} FROM ${t} WHERE ${where} ORDER BY series_key, bucket_ms FOR UPDATE`, args: [project, env, keys, buckets] };
  }
  const where = `${pc} = ? AND env = ? AND series_key IN (SELECT value FROM json_each(?)) AND bucket_ms IN (SELECT value FROM json_each(?)) AND h_count > 0`;
  return { sql: `SELECT ${cols} FROM ${t} WHERE ${where}`, args: [project, env, JSON.stringify(keys), JSON.stringify(buckets)] };
}
