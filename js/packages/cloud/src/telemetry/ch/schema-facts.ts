// ClickHouse fact tables (one row per request, trace, log line, slow span, search document, attribute), and views with the Postgres names.
import { EXPIRE, monthOf } from "./schema-raw.js";

const P = "project_id LowCardinality(String), trace_id String";
const VERSIONED = "ver UInt64, is_deleted UInt8, expire_ms Float64";

/** A fact table: replaced by version, deleted by tombstone; the view reads only live rows, with the Postgres columns. */
function fact(name: string, cols: string, order: string, time: string, indexes = ""): string[] {
  const names = cols.split(/,\s*/).map((c) => c.trim().split(/\s+/)[0]!);
  return [
    `CREATE TABLE IF NOT EXISTS ${name}_t (${P}, ${cols}, ${VERSIONED}${indexes ? `, ${indexes}` : ""})
     ENGINE = ReplacingMergeTree(ver, is_deleted) PARTITION BY ${monthOf(time)} ORDER BY (${order}) ${EXPIRE}`,
    `CREATE OR REPLACE VIEW ${name} AS SELECT project_id, org_id, trace_id, ${names.join(", ")} FROM ${name}_t FINAL`,
  ];
}

const REQUEST_COLS = [
  "env LowCardinality(String), start_ms Float64, method LowCardinality(String), path String, endpoint String, status Nullable(Int32)",
  "status_class LowCardinality(String), failed Bool, dur_class LowCardinality(String), aborted Bool, duration_ms Float64, server_ms Nullable(Float64)",
  "db_ms Float64, db_count Int32, fetch_count Int32, fetch_ms Float64, render_ms Nullable(Float64), network_ms Nullable(Float64)",
  "service LowCardinality(String), services String, errors Int32, insights Int32, health LowCardinality(String), user_agent Nullable(String)",
  "client_address Nullable(String), end_user Nullable(String), request_id Nullable(String), tags String, search String",
].join(", ");

/** The log fact columns as shipped; `pattern` came later (FACT_ALTERS). */
const LOG_COLS = "idx Int32, env LowCardinality(String), time_ms Float64, level LowCardinality(String), level_rank Int16, service LowCardinality(String), category String, message String, trace_name String, span_id Nullable(String), attributes String, search String";
const LOG_NAMES = LOG_COLS.split(/,\s*/).map((c) => c.split(/\s+/)[0]!).join(", ");

const SEARCH_COLS = [
  "kind LowCardinality(String), owner String, env LowCardinality(String), time_ms Float64, span_id Nullable(String), service String",
  "name Nullable(String), method Nullable(String), path Nullable(String), route Nullable(String), status Nullable(Int32), outcome Nullable(String)",
  "duration_ms Nullable(Float64), level_rank Nullable(Int16), category Nullable(String), span_kind Nullable(String), end_user Nullable(String)",
  "error Bool, message Nullable(String), text String",
].join(", ");

export const FACT_DDL: readonly string[] = [
  ...fact("fact_requests", REQUEST_COLS, "project_id, start_ms, trace_id", "start_ms"),
  ...fact("fact_traces", "env LowCardinality(String), start_ms Float64, path String, duration_ms Float64, health Nullable(String), status String, services String, span_count Int32, slow Bool, search String", "project_id, start_ms, trace_id", "start_ms"),
  ...fact("fact_logs", LOG_COLS, "project_id, time_ms, trace_id, idx", "time_ms"),
  ...fact("fact_critical", "span_id String, env LowCardinality(String), start_ms Float64, duration_ms Float64, name String, service LowCardinality(String), layer LowCardinality(String)", "project_id, start_ms, trace_id, span_id", "start_ms"),
  ...fact("fact_search", SEARCH_COLS, "project_id, kind, time_ms, trace_id, owner", "time_ms",
    "INDEX ix_text text TYPE ngrambf_v1(3, 65536, 2, 0) GRANULARITY 1, INDEX ix_trace trace_id TYPE bloom_filter GRANULARITY 1"),
  ...fact("fact_attrs", "src LowCardinality(String), owner String, key LowCardinality(String), value String, num Nullable(Float64), time_ms Float64", "project_id, key, value, trace_id, src, owner", "time_ms",
    "INDEX ix_trace trace_id TYPE bloom_filter GRANULARITY 1"),
];

/** Changes to shipped fact tables, in order. The n-gram bloom filled up at 8,192 rows a block and skipped nothing; the text index lists each block's n-grams. Log facts gained their pattern id. */
export const FACT_ALTERS: readonly string[] = [
  "ALTER TABLE fact_search_t ADD INDEX IF NOT EXISTS ix_text_ngrams text TYPE text(tokenizer = ngrams(3)) GRANULARITY 1",
  "ALTER TABLE fact_search_t DROP INDEX IF EXISTS ix_text",
  "ALTER TABLE fact_logs_t ADD COLUMN IF NOT EXISTS pattern String DEFAULT ''",
  "ALTER TABLE fact_logs_t ADD INDEX IF NOT EXISTS ix_pattern pattern TYPE bloom_filter GRANULARITY 1",
  `CREATE OR REPLACE VIEW fact_logs AS SELECT project_id, org_id, trace_id, ${LOG_NAMES}, pattern FROM fact_logs_t FINAL`,
];

/** Fact tables (storage names) and the columns that identify a row within a trace, for tombstones. */
export const FACT_KEYS: Record<string, readonly string[]> = {
  fact_requests_t: ["start_ms"],
  fact_traces_t: ["start_ms"],
  fact_logs_t: ["time_ms", "idx"],
  fact_critical_t: ["start_ms", "span_id"],
  fact_search_t: ["kind", "time_ms", "owner"],
  fact_attrs_t: ["key", "value", "src", "owner"],
};
