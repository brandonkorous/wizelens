// ClickHouse tables for what add-ons send: spans, logs, trace bounds, metric points, and the settle state.

/** Epoch ms in a column as a DateTime, for partitions and TTLs. */
export const secondsOf = (col: string): string => `toDateTime(intDiv(toUInt64(least(greatest(${col}, 0.), 4102444800000.)), 1000))`;
export const monthOf = (col: string): string => `toYYYYMM(${secondsOf(col)})`;
export const dayOf = (col: string): string => `toYYYYMMDD(${secondsOf(col)})`;
/** Rows go when their organization's retention runs out, set when they are written. */
export const EXPIRE = `TTL ${secondsOf("expire_ms")} DELETE`;

export const RAW_TABLES: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS spans_raw (
    project_id LowCardinality(String), trace_id String, span_id String, service LowCardinality(String), start_ms Float64, duration_ms Float64,
    session Nullable(String), json String CODEC(ZSTD(3)), ver UInt64, expire_ms Float64,
    INDEX ix_session session TYPE bloom_filter GRANULARITY 4
  ) ENGINE = ReplacingMergeTree(ver) PARTITION BY ${monthOf("start_ms")} ORDER BY (project_id, trace_id, span_id) ${EXPIRE}`,
  `CREATE TABLE IF NOT EXISTS logs_raw (
    project_id LowCardinality(String), trace_id String, key String, time_ms Float64, json String CODEC(ZSTD(3)), ver UInt64, expire_ms Float64
  ) ENGINE = ReplacingMergeTree(ver) PARTITION BY ${monthOf("time_ms")} ORDER BY (project_id, trace_id, key) ${EXPIRE}`,
  `CREATE TABLE IF NOT EXISTS trace_heads (
    project_id LowCardinality(String), trace_id String, start_ms SimpleAggregateFunction(min, Float64), end_ms SimpleAggregateFunction(max, Float64),
    updated_ms SimpleAggregateFunction(max, Float64), env SimpleAggregateFunction(max, String), expire_ms SimpleAggregateFunction(max, Float64)
  ) ENGINE = AggregatingMergeTree ORDER BY (project_id, trace_id) ${EXPIRE}`,
  `CREATE TABLE IF NOT EXISTS trace_updates (
    project_id LowCardinality(String), trace_id String, updated_ms Float64, env String
  ) ENGINE = MergeTree ORDER BY updated_ms TTL ${secondsOf("updated_ms")} + INTERVAL 2 DAY DELETE`,
  `CREATE TABLE IF NOT EXISTS settle_state (
    project_id LowCardinality(String), trace_id String, settled_ms Float64, contrib String CODEC(ZSTD(3)), ver UInt64, expire_ms Float64
  ) ENGINE = ReplacingMergeTree(ver) ORDER BY (project_id, trace_id) ${EXPIRE}`,
  `CREATE TABLE IF NOT EXISTS metric_points_raw (
    project_id LowCardinality(String), time_ms Float64, env LowCardinality(String), service LowCardinality(String), name LowCardinality(String),
    series_key String, json String CODEC(ZSTD(3)), expire_ms Float64
  ) ENGINE = MergeTree PARTITION BY ${monthOf("time_ms")} ORDER BY (project_id, name, time_ms) ${EXPIRE}`,
  `CREATE TABLE IF NOT EXISTS project_retention (
    project_id String, days UInt32, ver UInt64
  ) ENGINE = ReplacingMergeTree(ver) ORDER BY project_id`,
];
