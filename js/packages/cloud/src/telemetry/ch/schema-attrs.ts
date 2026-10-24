// Hourly attribute counts for autocomplete: keys per hour, and values per key and hour, so suggestions read a few rows and never join fact_attrs.
import { EXPIRE, monthOf } from "./schema-raw.js";

const HOUR = "toFloat64(intDiv(toInt64(time_ms), 3600000) * 3600000)";
const COUNT = "n SimpleAggregateFunction(sum, Float64), expire_ms SimpleAggregateFunction(max, Float64)";
/** A new attribute row adds one, its tombstone takes it away; tombstones never keep a bucket alive. */
const ADDS = "sum(if(is_deleted = 1, -1, 1)) AS n, max(if(is_deleted = 1, 0, expire_ms)) AS expire_ms";

export const ATTR_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS attr_keys_t (
    project_id LowCardinality(String), src LowCardinality(String), bucket_ms Float64, key String, ${COUNT}
  ) ENGINE = AggregatingMergeTree PARTITION BY ${monthOf("bucket_ms")} ORDER BY (project_id, src, bucket_ms, key) ${EXPIRE}`,
  `CREATE TABLE IF NOT EXISTS attr_values_t (
    project_id LowCardinality(String), src LowCardinality(String), key String, bucket_ms Float64, value String, ${COUNT}
  ) ENGINE = AggregatingMergeTree PARTITION BY ${monthOf("bucket_ms")} ORDER BY (project_id, src, key, bucket_ms, value) ${EXPIRE}`,
];

/** Fill the counts on every fact_attrs_t insert. Rows without their owner's time (written before it was kept) are left out. They read org_id, so they run after the org columns (see schema.ts). */
export const ATTR_VIEWS: readonly string[] = [
  `CREATE MATERIALIZED VIEW IF NOT EXISTS attr_keys_mv TO attr_keys_t AS
    SELECT project_id, org_id, src, ${HOUR} AS bucket_ms, key, ${ADDS} FROM fact_attrs_t WHERE time_ms > 0 GROUP BY project_id, org_id, src, bucket_ms, key`,
  `CREATE MATERIALIZED VIEW IF NOT EXISTS attr_values_mv TO attr_values_t AS
    SELECT project_id, org_id, src, key, ${HOUR} AS bucket_ms, value, ${ADDS} FROM fact_attrs_t WHERE time_ms > 0 GROUP BY project_id, org_id, src, key, bucket_ms, value`,
];
