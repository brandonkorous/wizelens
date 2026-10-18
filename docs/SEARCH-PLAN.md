# WizeLens — Search and ClickHouse Plan

Decided 2026-10-18. The cloud keeps its telemetry in **ClickHouse**, self-hosted on the shared sparx AKS
cluster. Postgres keeps only accounts and settings. The hub and the in-app add-on keep SQLite and memory.
One search language works the same in all three places.

## Status (2026-10-18)

| Step | State |
|---|---|
| 1. Search language (TS + C#, shared vectors) | Done |
| 2. Search on hub and cloud (`fact_search`, `fact_attrs`, API, autocomplete) | Done; parity with memory on SQLite and Postgres |
| 3. UI (Search page, query bar, Ctrl+K) and MCP `search` / `search_fields` | Done (Node, hub, cloud); .NET API and MCP in progress |
| 4. `TelemetryStore` interface in the cloud | Done |
| 5. ClickHouse store (`--clickhouse`) | Done; parity with memory for pages, lists, search, autocomplete, metrics, alerts, and re-settled traces |
| 6. Infra | Written, not applied: WizeLens `deploy/k8s/base/clickhouse*.yaml`, deploy steps; sparx.works branch `feat/wizelens-clickhouse` (password, backup storage, system/user node pools) |
| 7. Copy production data | `wizelens-cloud copy-telemetry` built and tested; runbook in `deploy/README.md` |
| 8. Docs | CONTRACT, CHANGELOG, deploy README |

Not done yet: hub FTS5 and Postgres `pg_trgm` indexes (searches are correct, but scan the time window), MCP `list_traces` /
`get_errors` / `find_slow_queries` on the store instead of the newest 500–2000 traces, and the load test targets in section 10.

## Why

- Today every search is a substring scan (`strpos` / `instr`) over a `search` text column, inside the
  time window. No index serves it. It gets slower as data grows.
- Span and log **attributes cannot be searched at all**. They live in TEXT JSON blobs.
- Ctrl+K searches only the 300 traces the browser loaded. MCP tools see only the newest 500–2000 traces.
- On the cloud, the same Postgres serves sign-in, keys, and alerts. A heavy search slows all of them.
- ClickHouse is a column store made for append-only telemetry. It compresses well, scans fast, and has
  GA full-text `text` indexes (since 26.2) plus bloom and n-gram skip indexes for "contains".

Rejected: Typesense (RAM-bound, built for catalogs, a second copy of the data, no help for hub or
in-app), Postgres-only indexes (GIN slows the ingest writes, and search still shares the auth DB),
ClickHouse Cloud (a monthly bill; the code is the same, so it stays an option later).

## Where data lives

| Tier | Telemetry (spans, logs, metrics, facts, rollups) | Accounts, keys, alerts, shares, saved searches | Search engine |
|---|---|---|---|
| In-app (.NET, Node) | Memory ring (+ optional SQLite file) | — | Search AST compiled to a predicate |
| Hub | SQLite | SQLite | SQLite + FTS5 + attribute table |
| Cloud, scale mode | **ClickHouse 26.8 LTS** | Postgres | ClickHouse text, bloom, n-gram indexes |
| Cloud, small mode (self-hosters, tests, trial) | Postgres / PGlite (as today) | Postgres / PGlite | Postgres with `pg_trgm` (best effort) |

The cloud picks scale mode when `--clickhouse <url>` (`WIZELENS_CLOUD_CLICKHOUSE_URL`) is set.

## 1. The search language (`@wizeworks/lens-core/search`, plus a C# port)

Shape: GitHub / Datadog style. Easy to type, easy for AI agents to write.

```
service:api status:>=500 duration:>1s user.id:42 "connection reset" -path:/health
@db.system:postgres @http.route:/orders/* (level:error OR level:fatal)
```

- Free words and `"quoted phrases"` match the text fields (message, span name, path, error, SQL text).
- `field:value`, with `>`, `>=`, `<`, `<=`, `!=`, `*` wildcards, `a..b` ranges, and duration units (`ms`, `s`, `m`).
- `@key:value` matches any span or log attribute. Known short names (`service`, `status`, `method`,
  `path`, `route`, `level`, `env`, `trace`, `span`, `user`, `error`, `kind`, `duration`) map to columns.
- `AND` (default), `OR`, `-`/`NOT`, and parentheses.
- Parser → typed AST → one compiler per backend: `memory`, `sqlite`, `pg`, `ch`.
- Errors come back with a position, so the UI can underline the bad part.
- Shared test vectors (`docs/search-vectors.json`) run in both the TS and the C# test suites, so both
  parsers stay the same.

## 2. ClickHouse schema (cloud scale mode)

All tables: `PARTITION BY toYYYYMMDD(time)`, `ORDER BY (project_id, …, time)`, ZSTD codecs, and a row
TTL from an `expire_ms` column that ingest sets from the org's retention.

| Table | Engine | What it holds |
|---|---|---|
| `spans` | MergeTree | One row per span: ids, parent, service, name, kind, category, status, start, duration, env, session, `attributes Map(LowCardinality(String), String)`, events, the full JSON for the trace view |
| `logs` | MergeTree | One row per log: time, level, service, category, message, span id, `attributes Map(...)` |
| `trace_heads` | ReplacingMergeTree(updated_ms) | One row per trace part write: start, end, updated, env, remotes |
| `settle_state` | ReplacingMergeTree(settled_ms) | settled_ms and `contrib` per trace (the settle queue) |
| `fact_requests`, `fact_traces`, `fact_logs`, `fact_critical` | ReplacingMergeTree(version, is_deleted) | Same columns as today; settling writes a new version instead of DELETE + INSERT |
| `fact_spans` (new) | ReplacingMergeTree | Every span as a searchable row (today only the 5 slowest are kept) |
| `rollup_{10s,5m,1h}`, `hist_*` | SummingMergeTree for the numbers; `top`/`ids` as `AggregatingMergeTree` states (`argMax`, `groupArraySorted`) | The settle deltas as plain inserts: new minus old, the same delta engine as today |
| `metric_points`, `metric_series`, `metric_*` | MergeTree / ReplacingMergeTree / SummingMergeTree | As today |
| `attr_keys`, `attr_values` | AggregatingMergeTree, fed by materialized views | Attribute names and top values per project per day, for autocomplete |

Indexes:
- `text` index on `logs.message`, `spans.name`, error messages, and the DB statement attribute.
- `ngrambf_v1` on path and endpoint, for `*foo*` matches.
- `bloom_filter` on `trace_id`, `mapKeys(attributes)`, and `mapValues(attributes)`.
- `minmax` on duration and status.

Reads on Replacing tables use `FINAL`. ClickHouse runs it per partition, in parallel. Rollup reads
already `SUM … GROUP BY`, so rows that are not merged yet still add up right.

Retention: the TTL drops old partitions for free. When an org shortens retention, a job runs one
lightweight `DELETE` for that org.

## 3. Cloud code changes (`@wizeworks/lens-cloud`)

- A `TelemetryStore` interface: write parts, read and join traces, list, settle, prune, metrics, the
  page executor, and search. Two implementations: `pg` (today's code, moved behind the interface) and `ch`.
- A third dialect `ch` in `core/src/scale/sql/dialect.ts`: `{p1:Type}` parameters, `FINAL`, no
  `ON CONFLICT`. Writes become batched inserts with the official `@clickhouse/client`.
- Ingest writes buffer for up to 1 s or 10k rows, then send one insert per table (ClickHouse wants
  few, large inserts). It uses `async_insert` as a safety net.
- Settling reads the dirty traces from `trace_heads` against `settle_state`, newest first. It keeps
  the Postgres advisory lock, so only one instance settles.
- `checkFactsVersion` rebuilds facts with `TRUNCATE`, then re-settles.
- Search API, the same on all three tiers:
  - `GET api/search?q=&kind=requests|traces|spans|logs&range=&env=&limit=&cursor=`. A keyset cursor
    (time + id), never OFFSET. The result says `partial: true` when it hit the scan budget.
  - `GET api/search/fields?prefix=` and `GET api/search/values?field=&prefix=` for autocomplete.
  - `GET api/search/status`: index lag (dirty traces, insert buffer depth) and the ClickHouse health.
- Page model lists (`requests`, `logs`, `traces`) take the same `q` language. The old `q` substring
  still works as free words.
- Saved searches: a new Postgres table, per project, with share-to-team.
- A failure is not a miss. The API returns 503 `search_unavailable`, and the UI says "search is down"
  instead of "nothing found".

## 4. Hub (`@wizeworks/lens-hub`)

- FTS5 virtual tables over `fact_logs.message` and the new `fact_spans` text (trigram tokenizer, so
  "contains" is indexed).
- `span_attrs(project, trace_id, span_id, key, value, time)` and `log_attrs`, indexed by
  `(project, key, value)`.
- The same search API and compiler (`sqlite`).

## 5. In-app add-ons (Node and .NET)

- The AST compiles to a predicate over the memory ring. Same API routes, same results shape.
- The .NET port lives in `dotnet/src/WizeLens.AspNetCore/Search/`. It passes the shared vectors.

## 6. UI (`@wizeworks/lens-ui`)

- A query bar on Requests, Traces, Logs, and a new **Search** page. It has autocomplete for fields,
  attribute keys, and values, shows chips for each filter, underlines errors, and keeps the query in
  the URL.
- The Search page shows results across kinds (requests, traces, spans, logs) with counts per kind and
  a time histogram.
- Ctrl+K asks the server (debounced, top 5 per kind), and keeps today's local page jumps.
- Saved searches in the sidebar. "Search is down" and "still indexing" states.

## 7. MCP and AI access

- A new `search` tool (`q`, `kind`, `range`, `limit`, `cursor`), plus `search_fields`, on Node, .NET,
  hub, and cloud.
- `list_traces`, `get_errors`, and `find_slow_queries` run on the store, not on a 500-trace slice.
- Cloud: read-key scopes and the audit log, as today.

## 8. Infrastructure (sparx.works repo, branch off main in a new worktree)

- `clickhouse/clickhouse-server:26.8` (LTS, pinned to a patch version) StatefulSet, 1 replica,
  namespace `wizelens`. No Keeper: one node needs no replication.
- PVC `managed-csi-premium`, 64 Gi to start, can grow online.
- Memory cap with `max_server_memory_usage` and small mark and uncompressed caches, so it shares the
  node. Requests 1 CPU / 3 Gi, limit 4 Gi to start.
- Users: `wizelens_app` (read and write on database `wizelens`) and `wizelens_ro` (read only, for
  ops). Passwords go in `kv-wizelens-prod-cus`, then into the pod through the existing vault env script.
- ClusterIP only. A NetworkPolicy lets only the cloud pod and the backup job connect.
- Backups: `clickhouse-backup` CronJob to an Azure Blob container, every night, with 7 daily and
  4 weekly copies kept. This data is **primary**, not derived (unlike Typesense in sparx), so backup
  is required.
- Health: `/ping` probes. Prometheus metrics endpoint on, for WizeLens to watch itself.
- Node: the sparx node is 1 × 16 GiB and shared. ClickHouse needs about 3–4 GiB. **Check the free
  memory first; growing to 32 GiB may be needed** (the sparx notes say grow `node_size`, never
  `node_count`).

## 9. Moving production data

- The cloud went live 2026-10-18, so there is little data.
- `wizelens-cloud copy-telemetry --from postgres --to clickhouse` copies spans, logs, and metrics,
  then marks every trace dirty, so settling builds the facts in ClickHouse.
- After the copy is checked, a later migration drops the telemetry tables from Postgres.

## 10. Tests and proof

- Parity tests: the same fixtures through memory, SQLite, Postgres, and ClickHouse must give the
  same page models and search results (extends today's `parity-*.test.ts`).
- CI: a ClickHouse service container on the Linux job. Windows skips the ClickHouse suite.
- Local: `docker run clickhouse/clickhouse-server:26.8`, or `deploy/docker-compose.cloud.yml` gets a
  ClickHouse service.
- Load test targets on one node: 2,000 traces/s ingest; search under 300 ms over 30 days at 100M
  spans; pages under 100 ms.
- Piggles test bed: point the local cloud at ClickHouse and run real traffic.

## 11. Build order

1. Search language: parser, AST, memory compiler, TS + C# ports, test vectors.
2. Hub: FTS5, attribute tables, search API, `sqlite` compiler.
3. UI: query bar, Search page, server Ctrl+K, MCP `search` tool. (These work on the hub and in-app
   right away.)
4. Cloud: `TelemetryStore` interface; move today's Postgres code behind it, with no behavior change.
5. Cloud: ClickHouse store, schema, `ch` dialect, ingest buffer, settle, search, autocomplete.
6. Infra in sparx.works: StatefulSet, secrets, backups, NetworkPolicy. A person applies it.
7. Copy production data, switch on `WIZELENS_CLOUD_CLICKHOUSE_URL`, watch, then drop the old tables.
8. Docs: `CONTRACT.md`, `CHANGELOG.md`, site docs.

All code follows the repo rules: 50 lines per function, 250 lines per file, one-line comments.
