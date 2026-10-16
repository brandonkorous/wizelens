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
`Access-Control-Expose-Headers: X-WizeLens-Trace, X-WizeLens-Endpoint` (append, do not replace).

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
| `POST api/client-spans` | Body `{ spans: Span[] }`. Browser spans. Stored into their traces. 204. |
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
| `federation` | The dashboard finds other services through trace `remotes` and reads them directly | ✅ | | |
| `environments` | The host holds more than one environment; the environment picker switches between them | | maybe | ✅ |
| `accounts` | Users sign in; the top bar shows the user | | | ✅ |
| `alerts` | The host sends alerts; the bell lists them | | | ✅ |
| `sharing` | Traces and views can be shared by link | | | ✅ |
| `serverStats` | The host computes page numbers itself; the dashboard asks for them instead of downloading full traces | | maybe | ✅ |

Today both add-ons answer `mode: "in-app"` and `capabilities: ["federation"]`.

## Add-on options (v0.3)

| Option | .NET | Node | Default |
|---|---|---|---|
| Capture response bodies | `CaptureResponseBody` | `captureResponseBody` | false |
| Tag the current request | `WizeLensRequest.Tag(key, value?)` | `wizelens.tag(key, value?)` | — |
| Set the current user | automatic from `HttpContext.User` | `wizelens.setUser(id)` | — |

## Redaction

Before storing, replace values with `"[redacted]"` when the key (case-insensitive) contains any of:
`authorization`, `cookie`, `password`, `passwd`, `secret`, `token`, `apikey`, `api_key`, `connectionstring`.
Applies to attributes, DB parameter names, and header names. List is configurable.

## Analysis (shared logic, same results in .NET and JS)

- **Duplicate query**: ≥ 2 `db` spans in one trace with identical `db.query.text` AND identical `wizelens.db.parameters`.
- **N+1 query**: ≥ 5 (configurable) `db` spans in one trace with identical `db.query.text` (params may differ).
- **N+1 HTTP**: ≥ 5 `http.client` spans in one trace with the same method + host + path shape
  (path shape = path with numeric / guid segments and query values replaced by `{}`).
- **Slow query**: `db` span with `durationMs` ≥ 100 (configurable).

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

Schema (shared, so the phase 2 hub can read any service's file):

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
