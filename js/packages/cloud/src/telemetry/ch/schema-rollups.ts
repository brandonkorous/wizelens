// ClickHouse rollup, histogram, and metric tiers: rows add up when they merge, and views read them merged with the Postgres names.
import { IDS_MAX, LOOSE_TRACE_PREFIX, TIERS } from "@wizeworks/lens-core";
import { dayOf, EXPIRE, monthOf, secondsOf } from "./schema-raw.js";

const sum = (c: string) => `${c} SimpleAggregateFunction(sum, Float64)`;
const COUNTERS = ["c0", "c1", "c2", "c3", "c4", "c5"];

/** Short tiers age out by bucket; the 1 h tier by retention. Day partitions for short tiers, month for 1 h. */
function tierTail(tier: (typeof TIERS)[number]): string {
  const ttl = tier.keepMs === null ? EXPIRE : `TTL ${secondsOf("bucket_ms")} + INTERVAL ${Math.ceil(tier.keepMs / 1000)} SECOND DELETE`;
  return `PARTITION BY ${tier.keepMs === null ? monthOf("bucket_ms") : dayOf("bucket_ms")} ${ttl}`;
}

function rollupDdl(tier: (typeof TIERS)[number]): string[] {
  const t = tier.table;
  const cols = [
    "project_id LowCardinality(String), env LowCardinality(String), kind LowCardinality(String), key String, bucket_ms Float64",
    ...["n", "err", "sum_v", ...COUNTERS].map(sum),
    "first_ms SimpleAggregateFunction(min, Float64), last_ms SimpleAggregateFunction(max, Float64), top_rank SimpleAggregateFunction(max, Float64)",
    `top AggregateFunction(argMax, Nullable(String), Float64), ids AggregateFunction(groupArraySorted(${IDS_MAX}), Tuple(Float64, String))`,
    "expire_ms SimpleAggregateFunction(max, Float64)",
  ].join(", ");
  const read = ["project_id", "org_id", "env", "kind", "key", "bucket_ms", "n", "err", "sum_v", ...COUNTERS, "first_ms", "last_ms", "top_rank"].join(", ");
  const finals = "finalizeAggregation(top) AS top, arrayStringConcat(arrayMap(x -> x.2, finalizeAggregation(ids)), ' ') AS ids";
  return [
    `CREATE TABLE IF NOT EXISTS ${t}_t (${cols}) ENGINE = AggregatingMergeTree ORDER BY (project_id, kind, bucket_ms, env, key) ${tierTail(tier)}`,
    `CREATE OR REPLACE VIEW ${t} AS SELECT ${read}, ${finals} FROM ${t}_t FINAL`,
    `CREATE TABLE IF NOT EXISTS ${tier.hist}_t (
      project_id LowCardinality(String), env LowCardinality(String), kind LowCardinality(String), key String, bucket_ms Float64, bin Int32,
      cnt SimpleAggregateFunction(sum, Float64), expire_ms SimpleAggregateFunction(max, Float64)
    ) ENGINE = AggregatingMergeTree ORDER BY (project_id, kind, bucket_ms, env, key, bin) ${tierTail(tier)}`,
    `CREATE OR REPLACE VIEW ${tier.hist} AS SELECT project_id, org_id, env, kind, key, bucket_ms, bin, cnt FROM ${tier.hist}_t FINAL`,
  ];
}

function metricDdl(tier: (typeof TIERS)[number]): string[] {
  const t = `metric_${tier.name}`;
  const nmin = (c: string) => `${c} SimpleAggregateFunction(min, Nullable(Float64))`;
  const nmax = (c: string) => `${c} SimpleAggregateFunction(max, Nullable(Float64))`;
  const cols = [
    "project_id LowCardinality(String), env LowCardinality(String), series_key String, name LowCardinality(String), bucket_ms Float64",
    sum("cnt"), sum("vsum"), nmin("vmin"), nmax("vmax"), "first_ms SimpleAggregateFunction(min, Float64)",
    "first_v AggregateFunction(argMin, Nullable(Float64), Float64)", "last_ms SimpleAggregateFunction(max, Float64)",
    "last_v AggregateFunction(argMax, Nullable(Float64), Float64)", sum("rate_delta"), sum("rate_ms"), sum("h_count"), sum("h_sum"), nmin("h_min"), nmax("h_max"),
    "h_bounds AggregateFunction(argMax, Nullable(String), UInt64), h_counts AggregateFunction(argMax, Nullable(String), UInt64)",
    "expire_ms SimpleAggregateFunction(max, Float64)",
  ].join(", ");
  const read = "project_id, org_id, env, series_key, name, bucket_ms, cnt, vsum, vmin, vmax, first_ms, last_ms, rate_delta, rate_ms, h_count, h_sum, h_min, h_max";
  const finals = ["first_v", "last_v", "h_bounds", "h_counts"].map((c) => `finalizeAggregation(${c}) AS ${c}`).join(", ");
  return [
    `CREATE TABLE IF NOT EXISTS ${t}_t (${cols}) ENGINE = AggregatingMergeTree ORDER BY (project_id, name, bucket_ms, env, series_key) ${tierTail(tier)}`,
    `CREATE OR REPLACE VIEW ${t} AS SELECT ${read}, ${finals} FROM ${t}_t FINAL`,
  ];
}

const SERIES_DDL = [
  `CREATE TABLE IF NOT EXISTS metric_series_t (
    project_id LowCardinality(String), env LowCardinality(String), series_key String, name LowCardinality(String), service LowCardinality(String),
    kind LowCardinality(String), unit String, description String, monotonic Bool, temporality String, attributes String, last_ms Float64,
    last_value Nullable(Float64), last_hist Nullable(String), ver UInt64, expire_ms Float64
  ) ENGINE = ReplacingMergeTree(ver) ORDER BY (project_id, env, series_key) ${EXPIRE}`,
  `CREATE OR REPLACE VIEW metric_series AS SELECT project_id, org_id, env, series_key, name, service, kind, unit, description, monotonic, temporality,
    attributes, last_ms, last_value, last_hist FROM metric_series_t FINAL`,
];

/** Distinct trace ids per project, env, and hour of trace_heads writes, as mergeable sketches: trace counts add up across projects without counting a shared trace twice. Loose (log-only) batches keep their own rows, which expire by the log days. */
const TRACE_HOURS_DDL = `CREATE TABLE IF NOT EXISTS trace_hours_t (
    project_id LowCardinality(String), loose UInt8, bucket_ms Float64, env LowCardinality(String),
    ids AggregateFunction(uniqCombined64, String), expire_ms SimpleAggregateFunction(max, Float64)
  ) ENGINE = AggregatingMergeTree PARTITION BY ${monthOf("bucket_ms")} ORDER BY (project_id, loose, bucket_ms, env) ${EXPIRE}`;

/** What one block of trace_heads rows adds to trace_hours_t. */
export const TRACE_HOURS_SELECT = `SELECT project_id, org_id, toUInt8(startsWith(trace_id, '${LOOSE_TRACE_PREFIX}')) AS loose,
    toFloat64(intDiv(toInt64(start_ms), 3600000) * 3600000) AS bucket_ms, env, uniqCombined64State(trace_id) AS ids, max(expire_ms) AS expire_ms
  FROM trace_heads GROUP BY project_id, org_id, loose, bucket_ms, env`;

/** Fills trace_hours_t on every trace_heads insert. It reads org_id, so it runs after the org columns (see schema.ts). */
export const TRACE_HOURS_VIEW = `CREATE MATERIALIZED VIEW IF NOT EXISTS trace_hours_mv TO trace_hours_t AS ${TRACE_HOURS_SELECT}`;

export const ROLLUP_DDL: readonly string[] = [...TIERS.flatMap(rollupDdl), ...TIERS.flatMap(metricDdl), ...SERIES_DDL, TRACE_HOURS_DDL];
