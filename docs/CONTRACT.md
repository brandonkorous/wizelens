# WizeLens — Wire Contract (v0)

Every add-on (.NET, Node, browser) MUST follow this. The UI depends only on this contract.

## Base path

`/_wizelens` (configurable). All paths below are relative to it.

## HTTP headers

| Header | Direction | Meaning |
|---|---|---|
| `traceparent` | request | W3C trace context. Honor on incoming, send on outgoing. |
| `X-WizeLens-Trace` | response | Trace id (32 hex) of the request that produced this response. |
| `X-WizeLens-Endpoint` | response | Absolute URL of this service's wizelens base, e.g. `http://localhost:5200/_wizelens`. |
| `X-WizeLens-Hop` | request (federation) | Integer hop count. Stop federating when > 5. |

Every app response that the add-on sees also gets
`Access-Control-Expose-Headers: X-WizeLens-Trace, X-WizeLens-Endpoint` (append, do not replace). The names must
survive a CORS layer that sets the same header later (for example `@fastify/cors` or Express `cors`), so the Node add-on
merges them in again when the response headers are written.

When an outgoing HTTP call gets a response with `X-WizeLens-Endpoint`, the add-on adds that URL to
the current trace's `remotes` list (de-duplicated, and never its own endpoint).

gRPC uses the same key as metadata: a gRPC server sends `x-wizelens-endpoint` in its response headers (merged into any
headers the handler sends) and in its trailers, and a gRPC client reads either one into `remotes`.

## Endpoints

All `api/*` endpoints return JSON (camelCase) and send `Access-Control-Allow-Origin: *`.

| Method + path | Returns |
|---|---|
| `GET /` and static files | Dashboard UI (from `@wizeworks/lens-ui` build). Hash routing: `#/`, `#/requests`, `#/traces`, `#/traces/{traceId}[/{view}]`, `#/database`, `#/rendering`, `#/errors`, `#/logs`, `#/services`, `#/insights`, `#/settings`. `{view}` is one of `timeline`, `sql`, `http`, `logs`, `errors`, `insights`. |
| `GET api/info` | `ServiceInfo` (see Types) |
| `GET api/traces?limit=50&session={id}` | `TraceSummary[]`, newest first. With `session`, only traces that have a span whose `wizelens.browser.session` equals `{id}`. |
| `GET api/traces?full=true&limit=1000&since={ms}` | `Trace[]` from this service only (no federation), newest first. `limit` max 5000. With `since`, only traces whose last activity (`startMs + durationMs`) is at or after `{ms}`. The dashboard uses this for its charts and merges the results of every service it knows. |
| `GET api/traces/{traceId}?federate=true` | `Trace` (404 if unknown and no remote has it) |
| `POST api/client-spans` | Body `{ spans: Span[], logs?: (LogRecord & { traceId })[] }`. Browser spans and browser log lines. Stored into their traces. At most 500 spans and 100 logs per call; log messages are cut at 4000 characters. 204. |
| `POST mcp` (+ GET for SSE if SDK needs) | MCP streamable HTTP. Only when MCP is enabled. 404 otherwise. |

### Federation (`federate=true`)

1. Load the local trace (may be missing).
2. For each URL in `remotes`, `GET {remote}/api/traces/{traceId}?federate=true` with `X-WizeLens-Hop: n+1`. Timeout 2 s. Ignore failures.
3. Merge: union spans by `spanId`, union logs, union remotes. Recompute summary fields.
   `service` and `rootName` come from the span with no parent (or the earliest span).

## Types

Times are Unix epoch **milliseconds** as floating point numbers (sub-ms precision allowed).

```ts
type SpanKind = "server" | "client" | "internal" | "producer" | "consumer";
type SpanStatus = "unset" | "ok" | "error";
type SpanCategory = "http.server" | "http.client" | "db" | "messaging" | "browser" | "internal";

interface Span {
  traceId: string;          // 32 lowercase hex
  spanId: string;           // 16 lowercase hex
  parentSpanId: string | null;
  name: string;             // "GET /api/orders", "SELECT customers", "fetch /api/orders"
  kind: SpanKind;
  category: SpanCategory;
  service: string;          // "gateway-api", "orders-api", "browser"
  startMs: number;
  durationMs: number;
  status: SpanStatus;
  statusMessage: string | null;
  attributes: Record<string, string | number | boolean | null>;
  events: SpanEvent[];
}

interface SpanEvent {
  name: string;             // "exception" uses OTel exception.* attributes
  timeMs: number;
  attributes: Record<string, string | number | boolean | null>;
}

interface LogRecord {
  timeMs: number;
  level: "trace" | "debug" | "info" | "warn" | "error" | "critical";
  category: string;
  message: string;
  service: string;
  spanId: string | null;
  attributes: Record<string, string | number | boolean | null>;
}

interface TraceSummary {
  traceId: string;
  rootName: string;
  service: string;
  startMs: number;
  durationMs: number;       // max(end) - min(start) over spans
  status: SpanStatus;       // "error" if any span is error
  spanCount: number;
  dbCount: number;
  httpClientCount: number;
  errorCount: number;
  services: string[];       // distinct, sorted
  rootMethod: string | null;     // http.request.method of the root span
  rootUrl: string | null;        // url.path, else url.full, of the root span
  rootStatusCode: number | null; // http.response.status_code of the root span
}

interface Trace extends TraceSummary {
  spans: Span[];            // sorted by startMs
  logs: LogRecord[];        // sorted by timeMs
  remotes: string[];
}

type HostMode = "in-app" | "hub" | "cloud";
type Capability = "federation" | "environments" | "accounts" | "alerts" | "sharing" | "serverStats";

interface ServiceInfo {
  mode?: HostMode;          // absent = "in-app"
  capabilities?: Capability[]; // absent = ["federation"]
  service: string;
  version: string;
  runtime: string;
  mcp: boolean;
  environment?: string;     // ASPNETCORE_ENVIRONMENT / NODE_ENV, e.g. "Development"
  host?: string;            // machine name
  startedMs?: number;
  storage?: { kind: "sqlite" | "memory"; maxTraces: number; maxAgeMs: number };
  analysis?: { slowQueryMs: number; nPlusOneThreshold: number };
  redactKeys?: string[];
  captureResponseBody?: boolean;
}
```

## Attribute names (OTel semantic conventions)

| Category | Attributes |
|---|---|
| http.server | `http.request.method`, `http.route`, `url.path`, `url.query`, `http.response.status_code`, `server.address`, `client.address` (first `X-Forwarded-For` value, else the socket), `user_agent.original`, `http.request.header.{name}` / `http.response.header.{name}` (lower-case names, values joined with `, `, max 50 headers, 1 KB each, redacted), `http.request.body.size`, `http.response.body.size`, `wizelens.request.id`, `enduser.id` (when known), `wizelens.tag.{key}` (app tags), `wizelens.server.routed_ms` (when the runtime can tell), `wizelens.response.body` + `wizelens.response.body.truncated` (only with body capture on: text and JSON, first 16 KB) |
| internal | `wizelens.layer` = `handler` for a controller action or endpoint handler span |
| gRPC (on http.server / http.client) | `rpc.system` = `grpc`, `rpc.service` (e.g. `orders.v1.Orders`), `rpc.method` (e.g. `GetOrder`), `rpc.grpc.status_code` (number). Name: `{service}/{method}`. A non-zero status code on the server is an error. |
| messaging | Kind `producer` (send) or `consumer` (receive / process). `messaging.system` (`rabbitmq`, `kafka`, `servicebus`), `messaging.operation.type` (`send`, `receive`, `process`), `messaging.destination.name` (queue, topic, or exchange), `messaging.message.id`, `messaging.batch.message_count`, `messaging.message.body.size`. Name: `{operation} {destination}`. |
| http.client | `http.request.method`, `url.full`, `server.address`, `server.port`, `http.response.status_code` |
| db | `db.system.name` (e.g. `sqlite`, `postgresql`, `microsoft.sql_server`), `db.query.text`, `db.operation.name`, `db.collection.name`, `db.namespace`, `db.response.returned_rows`, `wizelens.db.parameters` (JSON string, redacted), `wizelens.db.adapter` (`ado.net`, `efcore`, `pg`, `mysql2`, `better-sqlite3`, `node-sqlite`, `prisma`, `typeorm`, `drizzle`, ...). An ORM span (Prisma, TypeORM) hides the driver spans under it, so a query is counted once. |
| exception event | `exception.type`, `exception.message`, `exception.stacktrace` |
| browser (all) | `wizelens.browser.type` (`fetch` when absent, `pageview`, `react`, `error`), `wizelens.browser.session` (per-tab id, kept in sessionStorage key `wizelens.session`), `wizelens.browser.route` (path shape of the page), `url.full` |
| browser fetch | `http.request.method`, `http.response.status_code`, `wizelens.browser.page`, `wizelens.browser.render_ms` (ms from the response to the next paint; absent when not measured) |
| browser pageview | Own trace per page view. Span start = navigation start (or route change), duration = render time. `wizelens.browser.navigation` (`load` / `spa`), `wizelens.page.ttfb_ms`, `.ssr_ms` (responseStart − requestStart), `.client_render_ms` (FCP − responseEnd), `.fcp_ms`, `.lcp_ms`, `.cls`, `.inp_ms`, `.load_ms`, `.hydration_ms` (first React commit), `.render_ms`, `.image_ms` (slowest image), `.images`, `.large_images` (images bigger than shown and not lazy) |
| browser react | In the page view's trace. `wizelens.react.commits`, `wizelens.react.components` = JSON `{ name, renders, actualMs, selfMs, wasted, context }[]` since the last report |
| browser error | In the page view's trace. Status `error`, one `exception` event (`exception.type`, `.message`, `.stacktrace`) |

## Trace context in messages (v0.5)

A producer writes `traceparent` into the message headers (RabbitMQ headers, Kafka headers, Service Bus
application properties). A consumer reads it: the `process` span joins the producer's trace as a child of the
`send` span, so one trace follows a message across services. Without the header, the consumer starts a new trace.

| Library | .NET | Node |
|---|---|---|
| Npgsql, MySqlConnector, Microsoft.Data.SqlClient | automatic (their activity sources and diagnostics) | — |
| gRPC | automatic (Grpc.AspNetCore, Grpc.Net.Client) | `instrumentGrpc(wizelens, grpc)` for `@grpc/grpc-js` |
| RabbitMQ | automatic (RabbitMQ.Client 7+) | `instrumentAmqplib(wizelens, amqplib)` |
| Kafka | `WizeLens.Kafka` package (Confluent.Kafka) | `instrumentKafkaJs(wizelens, kafka)` |
| Azure Service Bus | automatic (Azure.Messaging.ServiceBus) | `instrumentServiceBus(wizelens, client)` |
| MassTransit | automatic | — |
| Fastify / Koa / Hono | — | `wizelensFastify(wizelens)`, `wizelensKoa(wizelens)`, `wizelensHono(wizelens)` |

## Host modes and capabilities (v0.4)

The same dashboard and HUD run in every mode. They read `mode` and `capabilities` from `api/info` and show or hide
features by capability, never by the mode name. The badge in the top bar shows the mode, the service, and how long data is kept.
Time ranges longer than `storage.maxAgeMs` are hidden.

| Capability | Means | In-app | Hub | Cloud |
|---|---|---|---|---|
| `federation` | The dashboard finds other services through trace `remotes` and reads them directly | ✅ | ✅ (services that do not send to the hub) | |
| `environments` | The host holds more than one environment and project; the top-bar picker filters by them | | ✅ | ✅ |
| `registry` | The host knows its services (`api/services`): online state, project, environment, runtime | | ✅ | ✅ |
| `accounts` | People sign in; the top bar shows the user and the Team page appears | | | ✅ |
| `alerts` | The host runs alert rules; the Alerts page and the bell show them | | | ✅ |
| `sharing` | Traces can be shared by a read-only link | | | ✅ |
| `serverStats` | The host computes page numbers itself (`api/models/<page>`); ranges reach 7 and 30 days | | | ✅ |
| `metrics` | The host keeps metrics; the Metrics page appears | ✅ | ✅ | ✅ |
| `serverMetrics` | The host computes the Metrics page itself (`api/models/metrics`). Without it, the browser reads `api/metrics/points` | | ✅ | ✅ |

Add-ons answer `mode: "in-app"` and `capabilities: ["federation"]`. The hub answers `mode: "hub"` and
`capabilities: ["federation", "environments", "registry"]`. Add-ons also report `project` and `hub` (the hub they send to) when set.

## Add-on options (v0.3)

| Option | .NET | Node | Default |
|---|---|---|---|
| Capture response bodies | `CaptureResponseBody` | `captureResponseBody` | false |
| Tag the current request | `WizeLensRequest.Tag(key, value?)` | `wizelens.tag(key, value?)` | — |
| Set the current user | automatic from `HttpContext.User` | `wizelens.setUser(id)` | — |

## Metrics (v0.8)

WizeLens keeps OpenTelemetry metrics next to traces. A point (`MetricPoint`, `@wizeworks/lens-core`):

```ts
{ name, kind: "gauge" | "sum" | "histogram", unit, description?, service,
  monotonic?,                          // sums: true for counters
  temporality?: "delta" | "cumulative", // sums and histograms
  attributes, timeMs, startMs?,
  value?,                              // gauges and sums
  histogram?: { count, sum, min?, max?, bounds: number[], counts: number[] } } // counts has bounds.length + 1 entries
```

A series is one name, one service, and one attribute set. Exponential histograms become explicit buckets (the upper bound of
positive bucket `i` is `base^(offset+i+1)`, `base = 2^(2^-scale)`; zero and negative counts go to the first bucket). A summary
becomes a histogram with count and sum and no buckets.

**How the page draws them** (`metricsModel`, the same code everywhere): gauges and up-down sums as their value; counters as a rate
per second (a drop means the counter restarted); histograms as p50, p95, and p99 from the bucket counts (cumulative points are
turned into the change since the previous point). Lines can be split by service or by an attribute.
The runtime strip shows, per service, the first of these that it sends:

| Tile | Metric names |
|---|---|
| CPU | `process.cpu.utilization`, `dotnet.process.cpu.time`, `process.cpu.time` |
| Memory | `process.memory.usage`, `dotnet.process.memory.working_set` |
| Heap | `v8js.memory.heap.used`, `dotnet.gc.last_collection.heap.size`, `jvm.memory.used` |
| Event loop delay | `nodejs.eventloop.delay.p99` |
| GC | `dotnet.gc.pause.time`, `v8js.gc.duration`, `jvm.gc.duration` |
| Thread pool queue | `dotnet.thread_pool.queue.length` |
| Request time | `http.server.request.duration` (p95) |

**Add-ons** collect every 10 seconds and keep one hour in memory (at most 50,000 points and 1,000 series).
`GET {base}/api/metrics/points?since=<epoch ms>` answers `{ points: MetricPoint[] }`, oldest first. Batches to a hub carry the
same points in `IngestBatch.metrics`.

- **Node** collects `process.cpu.utilization`, `process.cpu.time`, `process.memory.usage`, `v8js.memory.heap.used` and `.limit`,
  `nodejs.eventloop.utilization`, `nodejs.eventloop.delay.p50` / `.p99` / `.max`, and `v8js.gc.duration`. App metrics come in
  through `wizelensMetricExporter(wizelens)` in an OpenTelemetry `PeriodicExportingMetricReader`.
- **.NET** listens to every `Meter` with a `MeterListener`: the .NET runtime (`dotnet.*`), ASP.NET Core
  (`http.server.request.duration`, `kestrel.*`), `HttpClient`, and the app's own meters. Counters are sent as cumulative totals,
  histograms as delta per interval, with the instrument's advised bucket bounds.

| Option | .NET | Node | Default |
|---|---|---|---|
| Turn metrics on | `CaptureMetrics` | `captureMetrics` | true |
| How often | `MetricsInterval` | `metricsIntervalMs` | 10 s |
| How long they are kept | `MetricsMaxAge` | `metricsMaxAgeMs` | 1 h |

MCP: `list_metrics` (`range?`, `service?`, `q?`) and `get_metric` (`name`, `range?`, `service?`, `group?`, `stat?`), read-only.

## Redaction

Before storing, replace values with `"[redacted]"` when the key (case-insensitive) contains any of:
`authorization`, `cookie`, `password`, `passwd`, `secret`, `token`, `apikey`, `api_key`, `connectionstring`.
Applies to attributes, DB parameter names, and header names. List is configurable.

## Analysis (shared logic, same results in .NET and JS)

- **Duplicate query**: ≥ 2 `db` spans in one trace with identical `db.query.text` AND identical `wizelens.db.parameters`.
- **N+1 query**: ≥ 5 (configurable) `db` spans in one trace with identical `db.query.text` (params may differ).
- **Session statements** (`SET`, `RESET`, `BEGIN`, `START TRANSACTION`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`,
  `DISCARD`, `USE`) are never duplicates or N+1. Apps that set `SET LOCAL app.tenant_id` per query repeat them by design.
- **N+1 HTTP**: ≥ 5 `http.client` spans in one trace with the same method + host + path shape
  (path shape = path with numeric / guid segments and query values replaced by `{}`).
- **Slow query**: `db` span with `durationMs` ≥ 100 (configurable).
- **Database wait** (dashboard and HUD): 3 or more slow queries in one trace that overlap in time are one `db-wait` finding,
  not 3 slow queries. So is a slow session statement on its own (a `SET` does almost no work, so it waited).
  Its time is wall time: queries that waited together waited once. The MCP `find_slow_queries` tool still lists each query.

## Timing

- Database and outbound times are **wall time**: spans that overlap count once. "All queries added up" is shown next to it
  when queries ran at the same time. A request can never show more database time than server time.
- Span start and end times keep sub-millisecond precision, so queries that start in the same millisecond keep their order.

## Not traced

- CORS preflights (`OPTIONS` with `Access-Control-Request-Method`). The browser sends them with no `traceparent`, so they
  could never join a trace, and in a cross-origin app they are half of all requests.

## MCP tools (read-only, phase 1)

Server name `wizelens`. Disabled by default. Every call is written to the app log as an audit line.

| Tool | Args | Returns |
|---|---|---|
| `list_traces` | `limit?=20`, `minDurationMs?`, `status?` | TraceSummary[] |
| `get_trace` | `traceId`, `federate?=true` | Trace (spans + logs, redacted) |
| `find_slow_queries` | `thresholdMs?=100`, `limit?=20` | `{ traceId, spanId, durationMs, query, service }[]` |
| `find_n_plus_one` | `minRepeats?=5` | `{ traceId, kind: "db"\|"http", shape, count, totalMs }[]` |
| `get_errors` | `limit?=20` | `{ traceId, spanId, service, name, message, type, stack }[]` |

## Storage (v0.2)

Every add-on keeps a hot in-memory store (the read path) and, optionally, a SQLite file behind it.

| Option | .NET | Node | Default |
|---|---|---|---|
| Storage kind | `Storage = WizeLensStorage.Sqlite \| Memory` | `storage: "sqlite" \| "memory"` | `sqlite` when enabled |
| File | `StoragePath` | `storagePath` | `{contentRoot or cwd}/.wizelens/traces.db` |
| Max traces | `MaxTraces` | `maxTraces` | 2000 |
| Max age | `MaxAge` | `maxAgeMs` | 24 h |

Behavior:
1. On startup: open the file (create folder + schema), enable WAL, delete rows past the limits, load
   the newest `MaxTraces` traces into memory.
2. While running: changed traces are marked dirty. A background flusher writes dirty traces in one
   transaction every 500 ms, and once more on shutdown. Spans and logs are upserted / inserted, never
   rewritten in full.
3. After each flush: prune by age and count (same rules as the memory ring buffer).
4. If the file cannot be opened or written, log one warning and fall back to memory only. Never break the app.

Schema (shared: `wizelens-hub --import <file>` copies any add-on's file into the hub):

```sql
CREATE TABLE IF NOT EXISTS meta   (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- ('schema','1'), ('service', name)
CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY, start_ms REAL NOT NULL, updated_ms REAL NOT NULL,
  remotes TEXT NOT NULL DEFAULT '[]'                                             -- JSON string[]
);
CREATE TABLE IF NOT EXISTS spans  (
  trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT,
  name TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL, service TEXT NOT NULL,
  start_ms REAL NOT NULL, duration_ms REAL NOT NULL, status TEXT NOT NULL,
  session TEXT,                                                                  -- wizelens.browser.session
  json TEXT NOT NULL,                                                            -- full contract Span
  PRIMARY KEY (trace_id, span_id)
);
CREATE TABLE IF NOT EXISTS logs   (
  trace_id TEXT NOT NULL, seq INTEGER NOT NULL, time_ms REAL NOT NULL, level TEXT NOT NULL,
  json TEXT NOT NULL,                                                            -- full contract LogRecord
  PRIMARY KEY (trace_id, seq)
);
CREATE INDEX IF NOT EXISTS ix_traces_start  ON traces(start_ms);
CREATE INDEX IF NOT EXISTS ix_spans_session ON spans(session) WHERE session IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_spans_cat_dur ON spans(category, duration_ms);
```

Summaries are always computed from spans, never stored. Deleting a trace deletes its spans and logs.

## Local hub (v0.6, phase 2)

One process (`@wizeworks/lens-hub`, command `wizelens-hub`, default port **5960**) that every service sends to.
It serves the same dashboard at `/_wizelens/`, the same read API, OTLP/HTTP, and MCP.

### Sending to the hub

| Option | .NET | Node | Environment variable |
|---|---|---|---|
| Hub URL | `HubUrl` | `hub` | `WIZELENS_HUB` (for example `http://localhost:5960`) |
| Hub token | `HubToken` | `hubToken` | `WIZELENS_HUB_TOKEN` |
| Project | `Project` | `project` | `WIZELENS_PROJECT` |

The add-on keeps working as before (its own store and dashboard). In addition, it queues every new span, log, and remote
and sends them every second in one `IngestBatch` (at most 1000 of each). With nothing to send, it sends an empty batch every
10 seconds as a heartbeat. When the hub is down, it keeps the queue (at most 20000 items, oldest dropped first), backs off
up to 30 seconds, and logs one warning. The calls to the hub are never traced.

```ts
// POST {hub}/_wizelens/api/ingest   →  204, or 400 without sender.service
interface IngestBatch {
  sender: { service: string; project?: string; version?: string; runtime?: string; environment?: string;
            host?: string; endpoint?: string; startedMs?: number };   // endpoint = the add-on's own /_wizelens URL
  spans?: Span[];                                  // checked and redacted again by the hub
  logs?: { traceId: string; log: LogRecord }[];
  remotes?: { traceId: string; endpoint: string }[];
}
```

### Hub endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/_wizelens/api/info` | `mode: "hub"` |
| GET | `/_wizelens/api/traces` | Like the add-on, plus filters `env`, `project`, `before`. `since` means *changed since* (hub clock), so late spans are found |
| GET | `/_wizelens/api/traces/{id}` | With `federate=true`, also reads services that do not send to the hub |
| GET | `/_wizelens/api/services` | `{ services: HubService[], environments, projects, traces, spans }` |
| POST | `/_wizelens/api/ingest` | `IngestBatch` |
| POST | `/v1/traces`, `/v1/logs`, `/v1/metrics` | OTLP/HTTP, JSON or protobuf, optional gzip. Also under `/_wizelens/v1/...` |
| GET | `/_wizelens/api/models/metrics` | The Metrics page: `range`, `project`, `env`, `service`, `metric`, `group`, `stat`, `q`. At most 200,000 points are read, newest first; `meta.sampled` says when |
| POST | `/_wizelens/mcp` | With `--mcp`. The same five tools, over the newest 2000 traces of every service, plus `list_metrics` and `get_metric` |
| GET | `/healthz` | `ok` |

`HubService` is the sender plus `via` (`"addon"` or `"otlp"`), `firstSeenMs`, `lastSeenMs`, and `online` (heard from in the
last 30 seconds). OTLP apps send only when they have data, so the dashboard shows a quiet OTLP app as "Idle", not "Offline".

Trace `remotes` that point at a service which sends to the hub are hidden, so the dashboard does not read that service twice.

### OTLP mapping

- Resource `service.name` → service; `service.namespace` (or `wizelens.project`) → project;
  `deployment.environment.name` (or `deployment.environment`) → environment; `host.name` → host.
- Span kind, status, events, and attributes map one to one. Category uses the same rules as the add-ons.
- Older attribute names are copied to the current ones when the current one is missing: `http.method`, `http.status_code`,
  `http.url`, `http.target`, `http.scheme`, `db.statement`, `db.system`, `db.name`, `db.operation`, `net.peer.name`, `net.peer.port`.
- Log records keep their trace id. Records without one are skipped (WizeLens shows logs per trace).
  Severity 1–4 trace, 5–8 debug, 9–12 info, 13–16 warn, 17–20 error, 21–24 critical.
- Metrics: gauge, sum, histogram, exponential histogram, and summary, as described in "Metrics". Metric attributes are redacted.

### Access

The hub listens on `127.0.0.1` by default. For a team network, start it with `--host 0.0.0.0 --token <text>`.
With a token, every call needs `Authorization: Bearer <token>` (add-ons: `WIZELENS_HUB_TOKEN`; OTLP:
`OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>`). In a browser, open `/_wizelens/?token=<token>` once:
the hub keeps it in an HttpOnly cookie and removes it from the address.

### Hub storage

One SQLite file (default `~/.wizelens/hub/hub.db`), newest 50000 traces or 7 days. Traces are built from rows when read.

```sql
CREATE TABLE traces   (trace_id TEXT PRIMARY KEY, start_ms REAL, end_ms REAL, updated_ms REAL, env TEXT, project TEXT);
CREATE TABLE spans    (trace_id TEXT, span_id TEXT, service TEXT, start_ms REAL, duration_ms REAL, session TEXT, json TEXT,
                       PRIMARY KEY (trace_id, span_id));
CREATE TABLE logs     (trace_id TEXT, key TEXT, time_ms REAL, json TEXT, PRIMARY KEY (trace_id, key));  -- key = hash of the log identity
CREATE TABLE remotes  (trace_id TEXT, endpoint TEXT, PRIMARY KEY (trace_id, endpoint));
CREATE TABLE services (project TEXT, service TEXT, environment TEXT, host TEXT, via TEXT, info TEXT, first_seen REAL, last_seen REAL,
                       PRIMARY KEY (project, service, environment, host));                               -- '' for unknown
CREATE TABLE metrics  (time_ms REAL, project TEXT, env TEXT, service TEXT, name TEXT, series_key TEXT, json TEXT); -- series_key = sha1
```

Metric points older than the trace age limit are dropped, then the oldest past `--max-metric-points`
(`WIZELENS_HUB_MAX_METRIC_POINTS`, default 2,000,000). Files from older hubs upgrade by themselves (schema version 2).

## Cloud (v0.7, phase 3)

`@wizeworks/lens-cloud` (command `wizelens-cloud`, default port **5970**) is the hosted service. It serves the same dashboard,
answers `mode: "cloud"` with `capabilities: ["environments", "registry", "accounts", "alerts", "sharing", "serverStats"]`,
and keeps data in Postgres (`DATABASE_URL=postgres://...`). PGlite (`pglite:<folder>` or `memory`) runs the same SQL in-process,
for tests and trials.

### Tenancy and access

- **Organizations** hold **projects**. People join organizations with a role: `owner`, `admin`, `member`, `viewer`.
  Viewers read. Members also make alerts and share links. Admins also manage projects, keys, and members. Owners also manage owners.
  An organization always keeps one owner.
- **Sessions**: email and password (scrypt), an HttpOnly `wizelens_session` cookie (30 days, `SameSite=Lax`, `Secure` on https).
  Every change from a browser also needs the header `X-WizeLens-Client: dashboard`, so another site cannot send it.
- **Sign-up**: the first account sets up the cloud (`api/auth/setup`). After that, people join with an invite link (7 days, one use),
  or anyone can sign up when the cloud runs with `--signup open` (they get their own organization).
- **Keys** (only their SHA-256 hash is stored; the prefix tells what they are):
  - `wl_ik_…` **ingest key**: one project. Add-ons send it as `WIZELENS_HUB_TOKEN`; OTLP apps as `Authorization: Bearer …`.
    The project comes from the key, never from the sender. At most 1200 calls per key per minute (429 above).
  - `wl_rk_…` **read key**: one or more projects, read-only. For AI agents (MCP) and scripts.
- **Audit log**: org changes, member changes, keys, projects, shares, and every MCP tool call, with who did it.

### Endpoints (below `/_wizelens/`)

| Method | Path | Who |
|---|---|---|
| GET | `api/auth/state` | Anyone: `{ signedIn, needsSetup, signup, user?, orgs?[] with projects }` |
| POST | `api/auth/setup`, `signup`, `login`, `logout` | Anyone (setup only while no account exists) |
| GET / POST | `api/auth/invites/{token}`, `…/accept` | Anyone / signed in |
| POST / GET / PATCH | `api/orgs`, `api/orgs/{org}` | Signed in; read: any member; change: admin |
| POST / PATCH / DELETE | `api/orgs/{org}/invites`, `…/members/{user}` | Admin |
| POST / DELETE | `api/orgs/{org}/projects[/{id}]`, `…/{id}/clear` (deletes data only) | Admin |
| POST / DELETE | `api/orgs/{org}/keys[/{id}]` | Admin. The secret is in the answer once |
| GET | `api/orgs/{org}/audit?before=` | Admin |
| GET | `api/info`, `api/traces`, `api/traces/{id}`, `api/services` — all with `?project=` | Member or read key |
| GET | `api/models/{page}?project=&range=&env=&…` | Member or read key. See "Page models". `metrics` is a page too |
| GET / POST / PATCH / DELETE | `api/projects/{p}/alerts[/{id}]`, `…/{id}/test` | Read: viewer; change: member |
| POST / GET / DELETE | `api/projects/{p}/shares[/{id}]` | Read: viewer; change: member |
| GET | `api/shared/{token}` | Anyone with the link: `{ trace, expiresMs }` |
| POST | `api/ingest`, `/v1/traces`, `/v1/logs` | Ingest key |
| POST | `mcp?project=` | Read key (the project can be left out when the key has one) |

### Page models (`serverStats`)

Every dashboard page is one pure function in `@wizeworks/lens-core` (`PAGE_MODELS`: overview, requests, traces, database,
rendering, errors, logs, services, insights). It takes the traces of the chosen window and the window before it, plus the
page's URL parameters (filters, sort, page, selected item), and returns a JSON object. The browser runs it for in-app and hub
hosts; the cloud runs it on the server, so ranges reach `7d` and `30d`. Lists in a model are capped at 200 rows (Requests and
Logs page through all rows). The server reads at most `maxStatsTraces` (default 20000) traces per answer, newest first; above that
the model's `meta.sampled` says `{ used, total }` and the dashboard says so. Answers are cached for 15 seconds.

### Alerts

A rule watches one metric over a window (5 min to 24 h), optionally in one environment: `error_rate` (%), `p95_ms`, `avg_ms`,
`requests`, `new_errors` (error groups not seen in the window before), `slow_queries`. It fires when the value is above (`>`) or
below (`<`) the threshold. No data never fires, except `requests <` (traffic stopped). Rules run every minute. A notice is sent
only when the state changes (fired, resolved), to a webhook (the JSON notice) or a Slack incoming webhook, and kept as an event.
Webhook URLs must be https and may not resolve to private, loopback, or link-local addresses, unless the cloud runs with
`--allow-private-webhooks` (self-hosting on a private network).

A rule can also watch one OpenTelemetry metric: `metric: "metric"`, `metricName` (required), `metricStat`
(`last`, `avg`, `max`, `p95`, `p99`, or `rate`; default `avg`), and `metricService` (optional). The threshold is in the metric's
base unit (seconds, bytes, or 0 to 1 for ratios). Counters read as a rate per second; histograms read from their merged buckets.
No data never fires.

### Sharing

A share link (`#/shared/<token>`, 1 to 30 days) opens one trace, read-only, for anyone with the link. It can be revoked.
Views are counted. Nothing else is reachable with the token.

### Retention

Each organization keeps traces for `retention_days` (default 30, 1 to 400). Older traces are deleted every 10 minutes.
`POST …/projects/{id}/clear` deletes a project's data now.

### Cloud storage

Postgres, one schema, migrations in `wizelens_migrations`. Tables: `orgs`, `users`, `members`, `sessions`, `invites`, `projects`,
`api_keys`, `traces`, `spans`, `logs`, `services`, `metric_points`, `alert_rules`, `alert_events`, `shares`, `audit`.
Migration 2 added `metric_points` and the metric columns of `alert_rules`. Data tables are keyed by
`project_id`. Times are `double precision` epoch ms. Secrets (sessions, invites, keys, shares) are stored as SHA-256 hashes only.
