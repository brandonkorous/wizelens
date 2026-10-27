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
| `Server-Timing` | response | Appended: `wl-trace;desc={traceId}, wl-endpoint;desc="{endpoint}", wl-start;desc={epoch ms}`. The page reads it from the navigation entry, so the page load joins the trace of the request that rendered the HTML. |

Every app response that the add-on sees also gets
`Access-Control-Expose-Headers: X-WizeLens-Trace, X-WizeLens-Endpoint` (append, do not replace). The names must
survive a CORS layer that sets the same header later (for example `@fastify/cors` or Express `cors`), so the Node add-on
merges them in again when the response headers are written.

When an outgoing HTTP call gets a response with `X-WizeLens-Endpoint`, the add-on adds that URL to
the current trace's `remotes` list (de-duplicated, and never its own endpoint).

Federation and hub sends run with tracing suppressed (OTel `suppressTracing`), so no layer above the HTTP client (for
example the Next.js `fetch` wrapper) records them as app traffic.

### Browser spans and the server that owns their trace

A browser span sets `wizelens.browser.remote` to the WizeLens endpoint of the server that holds its trace, when that is not the
endpoint the page is set up with: from `wl-endpoint` (page load) or `X-WizeLens-Endpoint` (fetch). The page then sends the
span (and the logs of that trace) to `{remote}/api/client-spans` when the remote is on the page's own origin, and to its own
endpoint otherwise. A server that gets a browser span whose `wizelens.browser.remote` is on the request's `Origin` (same
origin, http or https) adds it to the trace's `remotes`, unless it is one of its own endpoints; a remote on any other origin
is ignored, so a page cannot point federation at a URL of its choice.

gRPC uses the same key as metadata: a gRPC server sends `x-wizelens-endpoint` in its response headers (merged into any
headers the handler sends) and in its trailers, and a gRPC client reads either one into `remotes`.

## Endpoints

All `api/*` endpoints return JSON (camelCase) and send `Access-Control-Allow-Origin: *`.

| Method + path | Returns |
|---|---|
| `GET /` and static files | Dashboard UI (from `@wizeworks/lens-ui` build). Hash routing: `#/`, `#/requests`, `#/traces`, `#/traces/{traceId}[/{view}]`, `#/database`, `#/rendering`, `#/errors`, `#/logs`, `#/services`, `#/insights`, `#/connect[/{section}]`, `#/settings[/{section}]` (hub and in-app; `tags` is one section), and on the cloud `#/people[/{section}]`, `#/organization[/{section}]`, and `#/account[/{section}]`. Old `#/team/...` and `#/settings/...` links open their new place (docs/SETTINGS-PLAN.md). `{view}` is one of `timeline`, `sql`, `http`, `messages`, `logs`, `errors`, `insights`, `security`. |
| `GET api/info` | `ServiceInfo` (see Types) |
| `GET api/traces?limit=50&session={id}` | `TraceSummary[]`, newest first. With `session`, only traces that have a span whose `wizelens.browser.session` equals `{id}`. Loose batches (lines outside a request) are left out of summaries on every host; `full=true` includes them. |
| `GET api/traces?full=true&limit=1000&since={ms}` | `Trace[]` from this service only (no federation), newest first. `limit` max 5000. With `since`, only traces whose last activity (`startMs + durationMs`) is at or after `{ms}`. The dashboard uses this for its charts and merges the results of every service it knows. |
| `GET api/traces/{traceId}?federate=true` | `Trace` (404 if unknown and no remote has it) |
| `POST api/client-spans` | Body `{ spans: Span[], logs?: (LogRecord & { traceId })[], sentAt?: number }`. Browser spans and browser log lines. Stored into their traces. At most 500 spans and 100 logs per call; log messages are cut at 4000 characters. 204. |
| `GET api/tags` | `TagList` (see "Tags"): the built-ins and the rules of the `tags` option, `editable: false` |
| `POST api/tags/match` | Body `{ kind, items: { traceId, owner, timeMs }[] }` (up to 200). `{ matches }`: tag names per row (see "Tags") |
| `POST mcp` (+ GET for SSE if SDK needs) | MCP streamable HTTP. Only when MCP is enabled. 404 otherwise. |
| `GET wizelens.js`, `GET wizelens.js.map` | .NET and Node add-ons, while they serve the dashboard: the `@wizeworks/lens-browser` script-tag bundle (`application/javascript`) and its source map, `Cache-Control: no-cache`. The add-ons put it on the app's HTML pages (see "The HUD on served pages"). 404 when send-only. |

### The HUD on served pages

While an add-on serves the dashboard and its HUD switch is on (.NET `Hud`, Node `hud`, both default true, or
`WIZELENS_HUD`), an answer gets
`<script src="{base}/wizelens.js" data-endpoint="{base}" data-hud="true" data-source="inject" defer></script>` right
before its last `</body>` when the request is a `GET` outside `{base}`, the answer is `200` with `Content-Type: text/html`
and no `Content-Encoding`, and the body has a `</body>`. Anything else passes through untouched. The body streams; a
`Content-Length` is dropped or set to the new length. A page navigation (`Accept` takes `text/html`) reaches the app
without `Accept-Encoding`, so a compressing layer answers it in plain HTML (.NET puts the header back once the answer
reaches the HUD, so compression placed before the add-on still compresses the tagged page).

In the browser, `hud` is `boolean | "auto"` (script tag: `data-hud`, default `auto`; `data-slow-ms`). `"auto"` asks
`GET {endpoint}/api/info` once and shows the HUD when it answers 200 with a JSON object; `readServer` follows `hud` unless
set. One instance per page: each started instance registers at `globalThis[Symbol.for("wizelens.browser")]` as
`{ source: "app" | "inject", stop() }`. An injected tag starts after the page's `load` event and does nothing when an
instance is registered; an app instance stops an injected one and takes over. See docs/HUD-PLAN.md.

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
type SpanCategory = "http.server" | "http.client" | "db" | "messaging" | "browser" | "internal" | "uptime";

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
  status: SpanStatus;       // "error" if any span is error, leaving out 4xx and expected answers
  spanCount: number;
  dbCount: number;
  httpClientCount: number;
  errorCount: number;
  services: string[];       // distinct, sorted
  rootMethod: string | null;     // http.request.method of the root span
  rootUrl: string | null;        // url.path, else url.full, of the root span
  rootStatusCode: number | null; // http.response.status_code of the root span
}

**Failures.** A span is an error when its status is `error` or it has an `exception` event, unless its
`http.response.status_code` is 400–499: a 4xx answer is never a failure, on server and client spans alike. `errorCount`,
the trace `status`, request `errors` (failed: `errors > 0` or status 500 and above), error groups, service and endpoint
error counts, the search `error` field, and `keepErrors` sampling all use this rule, in Node and .NET; the Go, Java, and Python
samplers use it too.

**Expected answers.** A span is *expected* when `wizelens.expected` is `true` (or `"1"`/`"true"`), or when its
`http.response.header.x-wizelens-expected` is set to anything but empty, `0`, `false`, or `no`. An expected span's `error`
status and its 5xx status code are not a failure; an `exception` event on it still is. A request row carries `expected`
from its entry server span (else its browser fetch span) and is failed when `errors > 0`, or when its status is 500 or more
and it is not expected; `health` is then not `critical` for the status alone. Stored request facts keep only `failed`, so a
row read back from a store reports `expected` only for a 5xx (`status >= 500 && !failed`). The Node add-on and the .NET
add-on set `wizelens.expected` and leave the span status unset when the app calls `expected()` / `Expected()` or answers
with the `X-WizeLens-Expected` header; the Node add-on lists that header in `Access-Control-Expose-Headers`, and the
browser package does not fail a fetch whose answer carries it.

interface Trace extends TraceSummary {
  spans: Span[];            // sorted by startMs
  logs: LogRecord[];        // sorted by timeMs
  remotes: string[];
}

type HostMode = "in-app" | "hub" | "cloud";
type Capability =
  | "federation" | "environments" | "registry" | "accounts" | "alerts" | "sharing"
  | "serverStats" | "metrics" | "serverMetrics" | "changes" | "search" | "issues"
  | "infra" | "uptime" | "statusPages" | "sourcemaps" | "slos" | "saved" | "tags";

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
  sampling?: SamplingInfo;  // absent = every trace is kept
}

interface SamplingInfo {
  rate: number;              // 0..1
  keepErrors: boolean;
  keepSlowMs: number | null; // server-side spans only
}
```

## Attribute names (OTel semantic conventions)

| Category | Attributes |
|---|---|
| http.server | `http.request.method`, `http.route`, `url.path`, `url.query`, `http.response.status_code`, `server.address`, `client.address` (first `X-Forwarded-For` value, else the socket), `user_agent.original`, `http.request.header.{name}` / `http.response.header.{name}` (lower-case names, values joined with `, `, max 50 headers, 1 KB each, redacted), `http.request.body.size`, `http.response.body.size`, `wizelens.request.id`, `enduser.id` (when known), `wizelens.tag.{key}` (app tags), `wizelens.expected` (the app expected the answer: see Expected answers), `wizelens.server.routed_ms` (when the runtime can tell), `wizelens.response.body` + `wizelens.response.body.truncated` (only with body capture on: text and JSON, first 16 KB), `wizelens.request.body` + `wizelens.request.body.truncated` (the Java, Python, and Go SDKs, with `WIZELENS_CAPTURE_BODY=true`; complete JSON has sensitive keys redacted), `wizelens.stream` + `wizelens.stream.first_byte_ms` (a stream answer: see Streams) |
| any span | `service.version`: the version of the app that ran it, so Problems can name a new release. Node: `release`, else `WIZELENS_RELEASE`, else `OTEL_SERVICE_VERSION`, else `npm_package_version`. .NET: `Release`, else `WIZELENS_RELEASE`, else `OTEL_SERVICE_VERSION`, else the entry assembly's informational version. OTLP: the resource's `service.version`, copied onto that service's spans that have none |
| internal | `wizelens.layer` = `handler` for a controller action or endpoint handler span |
| gRPC (on http.server / http.client) | `rpc.system` = `grpc`, `rpc.service` (e.g. `orders.v1.Orders`), `rpc.method` (e.g. `GetOrder`), `rpc.grpc.status_code` (number). Name: `{service}/{method}`. A non-zero status code on the server is an error. |
| messaging | Kind `producer` (send) or `consumer` (receive / process). `messaging.system` (`rabbitmq`, `kafka`, `servicebus`), `messaging.operation.type` (`send`, `receive`, `process`), `messaging.destination.name` (queue, topic, or exchange), `messaging.message.id`, `messaging.batch.message_count`, `messaging.message.body.size`. Name: `{operation} {destination}`. |
| http.client | `http.request.method`, `url.full`, `server.address`, `server.port`, `http.response.status_code` |
| db | A span is `db` when it has any of `db.system.name`, `db.system`, `db.query.text`, `db.operation.name`, `db.collection.name` (some libraries, such as Better Auth, send only the operation and the table). `db.system.name` (e.g. `sqlite`, `postgresql`, `microsoft.sql_server`), `db.query.text`, `db.operation.name`, `db.collection.name`, `db.namespace`, `db.response.returned_rows`, `wizelens.db.parameters` (JSON string, redacted), `wizelens.db.adapter` (`ado.net`, `efcore`, `pg`, `mysql2`, `better-sqlite3`, `node-sqlite`, `prisma`, `typeorm`, `drizzle`, ...). An ORM span (Prisma, TypeORM) hides the driver spans under it, so a query is counted once. |
| exception event | `exception.type`, `exception.message`, `exception.stacktrace`; browser errors also `wizelens.error.frame` (see "Source maps") |
| browser (all) | `wizelens.browser.type` (`fetch` when absent, `pageview`, `react`, `error`), `wizelens.browser.session` (per-tab id, kept in sessionStorage key `wizelens.session`), `wizelens.browser.route` (path shape of the page), `url.full`, `service.version` (the app release, when the app or its build plugin sets it) |
| browser fetch | `http.request.method`, `http.response.status_code`, `wizelens.browser.page`, `wizelens.browser.render_ms` (ms from the response to the next paint; absent when not measured), `wizelens.browser.cancelled` (aborted, cut off as the page was hidden or closed, or offline: no error, no exception), `wizelens.browser.prefetch` (a Next.js router prefetch: `_rsc=`, `RSC: 1`, or `Next-Router-Prefetch: 1`; never an error). Neither counts in the Web App row. |
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
| `accounts` | People sign in; the top bar shows the user, and the People & access and Organization pages take the place of Settings | | | ✅ |
| `alerts` | The host runs alert rules; the Alerts page and the bell show them. The hub at `api/alerts?project=`, the cloud at `api/projects/:project/alerts` | | ✅ | ✅ |
| `sharing` | Traces can be shared by a read-only link | | | ✅ |
| `serverStats` | The host computes page numbers itself (`api/models/<page>`); ranges reach 7 and 30 days | | ✅ | ✅ |
| `metrics` | The host keeps metrics; the Metrics page appears | ✅ | ✅ | ✅ |
| `serverMetrics` | The host computes the Metrics page itself (`api/models/metrics`). Without it, the browser reads `api/metrics/points` | | ✅ | ✅ |
| `search` | The host answers the search language (`api/search`, `api/search/suggest`); the Search page and Ctrl+K use it. Without it, the browser searches the loaded traces | ✅ | ✅ | ✅ |
| `infra` | The host answers `api/models/hosts` and `api/models/kubernetes` from OpenTelemetry Collector metrics (see "Hosts and Kubernetes"); the Hosts and Kubernetes pages appear | | ✅ | ✅ |
| `sourcemaps` | The host resolves browser stacks at `api/sourcemaps/resolve` (see "Source maps"). Without it, the dashboard resolves them in the browser from the maps the site serves | ✅ (Node) | ✅ | ✅ |
| `tags` | The host answers `api/tags` and `api/tags/match` (see "Tags"); lists show tag chips, Settings shows Tags, and "Tag this" appears. `editable` in `api/tags` says whether rules can change there | ✅ | ✅ | ✅ |
| `changes` | The host streams `api/changes?project=` (server-sent events): an `event: data` line each time the project gets new stats, at most every 2 s (the hub: each settle round), and a comment every 25 s. The dashboard reloads the open page then, keeping the old numbers on screen until the new ones arrive | | ✅ | ✅ |
| `saved` | The host keeps saved views, saved searches (log searches charted on the Logs page), and dashboards. See "Saved views and dashboards" below. Without it, the Logs page keeps its charted searches in the browser | | ✅ | ✅ |
| `slos` | The host keeps SLOs and Apdex targets. See "SLOs and Apdex" below | | ✅ | ✅ |
| `issues` | The host keeps issue states: error groups and insights can be resolved, ignored, and (cloud) assigned. See "Issue states" below | | ✅ | ✅ |
| `uptime` | The host runs uptime checks (`api/uptime` on the hub, `api/projects/{p}/uptime` in the cloud) and serves the `uptime` page model; the Uptime page appears. See "Uptime checks" | | ✅ (unless `--no-uptime`) | ✅ |
| `statusPages` | A project can turn on a public status page (`api/status/{token}`) | | | ✅ |

Add-ons answer `mode: "in-app"` and `capabilities: ["federation", "search", "tags"]`, plus `metrics` when metrics are on and `sourcemaps` (Node) unless `sourceMaps: false`. The hub
answers `mode: "hub"` and `capabilities: ["federation", "environments", "registry", "metrics", "serverMetrics", "serverStats",
"search", "changes", "issues", "alerts", "slos", "infra", "sourcemaps", "saved", "tags", "settings", "uptime"]` (`uptime` only while checks are on). Add-ons also report `project` and `hub` (the hub they send to) when set.

## Add-on options (v0.3)

| Option | .NET | Node | Default |
|---|---|---|---|
| Capture response bodies | `CaptureResponseBody` | `captureResponseBody` | false |
| Sampling rate (0..1) | `Sampling.Rate` | `sampling.rate` | 1, or `WIZELENS_SAMPLE_RATE` |
| Keep traces with an error | `Sampling.KeepErrors` | `sampling.keepErrors` | true |
| Keep traces with a slow server-side span (ms) | `Sampling.KeepSlowMs` | `sampling.keepSlowMs` | 1000 (null = off) |
| Keep log lines outside a request | `Logs.Outside` | `logs.outside` | true, or `WIZELENS_LOGS_OUTSIDE` |
| Lowest level kept outside a request | `Logs.MinLevel` (`LogLevel`) | `logs.minLevel` | info, or `WIZELENS_LOGS_MIN_LEVEL` |
| Share kept outside a request, below warn (0..1) | `Logs.SampleRate` | `logs.sampleRate` | 1, or `WIZELENS_LOGS_SAMPLE_RATE` |
| Tag the current request | `WizeLensRequest.Tag(key, value?)` | `wizelens.tag(key, value?)` | — |
| Tag rules (see "Tags") | `Tags.Rules.Add(new(name, query, color))` | `tags.rules: [{ name, query, color? }]` | none; a bad rule throws at startup |
| Turn off built-in tags | `Tags.DisableBuiltIns.Add("bot")` | `tags.disableBuiltIns: ["bot"]` | all on |
| Set the current user | automatic from `HttpContext.User` | `wizelens.setUser(id, { name })` | — |
| The app's version (`service.version` on every span) | `Release` | `release` (React: `release` prop) | `WIZELENS_RELEASE`, else the entry assembly's informational version (.NET) or `npm_package_version` (Node) |

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

**How the page draws them** (`metricsModelOf`, the same code everywhere): gauges and up-down sums as their value; counters as a rate
per second (a drop means the counter restarted); histograms as p50, p95, and p99 from the bucket counts (cumulative points are
turned into the change since the previous point). Lines can be split by service or by an attribute.

**Metric rollups.** The model reads per-series rollups, never a capped set of points. Hubs and the cloud write them at ingest,
in the same transaction as the raw points, into three tiers: `metric_10s` (kept 6 h 10 min), `metric_5m` (kept 50 h), and
`metric_1h` (kept for the retention). A tier row holds, per series and bucket, the point count and the sum, min, and max of the
values, the first and last value with their times, a counter's change and the time it took (`rate_delta`, `rate_ms`), and a
histogram's change (`h_count`, `h_sum`, `h_min`, `h_max`, and `h_bounds` / `h_counts` as JSON). `metric_series` keeps what each
series is (name, service, kind, unit, attributes, from its newest point) and its newest point, so a cumulative counter or
histogram gets the change since its previous point across batches and window edges: the first point of a series inside a window
counts its change from the point before the window. A point that is not newer than the stored one adds its value but no change.
Pages read the tiers the way they read the stats rollups (see "Stats tables"); `meta.sampled` is always `null`. In-app hosts send
raw points and the browser builds the same rollups in memory (`metricsModel({ points, range, now, params })`).
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

## Hosts and Kubernetes (phase 18)

There is no WizeLens agent. The OpenTelemetry Collector (contrib) sends host and cluster metrics over OTLP; the recipe is
`deploy/helm/wizelens-collector` (a DaemonSet with `kubeletstats`, `hostmetrics`, and an OTLP receiver; a one-replica
Deployment with `k8s_cluster`; both with `k8sattributes`) and `deploy/collector/host.yaml` for one machine.

**Ingest.** These resource attributes are copied onto every OTLP metric point, under the point's own (so one host, node,
or pod is one series): `host.name`, `os.type`, `k8s.cluster.name`, `k8s.node.name`, `k8s.namespace.name`, `k8s.pod.name`,
`k8s.container.name`, `k8s.deployment.name`, `k8s.statefulset.name`, `k8s.daemonset.name`, `k8s.job.name`,
`k8s.cronjob.name`, and `k8s.container.status.last_terminated_reason` (`INFRA_RESOURCE_KEYS`). OTLP spans get the
`k8s.cluster/node/namespace/pod/deployment/statefulset/daemonset` names the same way (`SPAN_RESOURCE_KEYS`), so a span links to
its pod and node. A resource with no `service.name` but `host.name` or `k8s.*` attributes is the service `"infrastructure"`
(`INFRA_SERVICE`) and is not written to the service registry. The sender gains `k8s?: { cluster?, namespace?, pod?, node? }`
from the resource (add-ons may send it too), and its `host` falls back to `k8s.pod.name`, so each pod is its own registry row.

**Read.** `infraSteps(dialect, scope, range, now, params)` reads the series of the metrics below over the window (totals and
first and last values), plus 60 line buckets for the chosen host (`host`), node (`node`), or pod (`pod` = `namespace/name`)
only; `infraDataOf(points, ...)` does the same from raw points. `hostsModelOf(data, registry)` and `kubeModelOf(data, registry)`
build the pages; the registry gives the services on each host and in each pod (by host name, by `k8s.node`, by `k8s.pod`, or
by a host name that is a pod's name). Other parameters: `q`, `cluster`, `ns`, `workload` (`namespace/Kind/name`), `service`.

| Page | Metrics read |
|---|---|
| Hosts | `system.cpu.utilization` (or `system.cpu.time`), `system.cpu.logical.count`, `system.cpu.load_average.1m`, `system.memory.usage` / `.utilization`, `system.filesystem.usage` / `.utilization`, `system.disk.io`, `system.network.io` |
| Kubernetes | `k8s.node.cpu.usage` (or `.utilization`), `k8s.node.memory.working_set`, `k8s.node.condition_ready`, `k8s.node.allocatable_cpu` / `_memory`, `k8s.node.network.io`, `k8s.pod.cpu.usage` (or `.utilization`), `k8s.pod.memory.working_set`, `k8s.pod.network.io`, `k8s.pod.phase`, `k8s.container.restarts` / `.ready` / `.memory_limit` / `.cpu_limit`, `k8s.deployment.desired` / `.available`, `k8s.statefulset.desired_pods` / `.ready_pods`, `k8s.daemonset.desired_scheduled_nodes` / `.ready_nodes`, `k8s.job.desired_successful_pods` / `.successful_pods` |

CPU busy is 1 minus the average idle share per CPU. A pod's restarts are its containers' newest `k8s.container.restarts`;
restarts in the range are the growth since the first point in the window. An out-of-memory kill is a container whose last
exit reason is `OOMKilled`. A pending pod has `k8s.pod.phase` 1. A pod not reported within 5 minutes of the newest data is
"Gone" and is not counted. Parity: `core/src/testing/infra-scenario.ts` (`INFRA_PARAM_SETS`) runs on memory, SQLite,
Postgres, and ClickHouse.

## Redaction

Before storing, replace values with `"[redacted]"` when the key (case-insensitive) contains any of:
`authorization`, `cookie`, `password`, `passwd`, `secret`, `token`, `apikey`, `api_key`, `connectionstring`.
Applies to attributes, DB parameter names, and header names. List is configurable.

Redaction keeps the evidence the security rules need (`docs/redact-vectors.json`, run by the TS and .NET tests):

- **`set-cookie`** keeps each cookie's name and flags: `sid=[redacted]; Path=/; Secure; HttpOnly`.
- **`url.query` and `url.full`** keep every key and lose the values of sensitive keys: `token=[redacted]`.
- **Values by pattern.** Every string value (attributes, event attributes, log messages and attributes) has these
  replaced with a typed marker: `[redacted:jwt]`, `[redacted:signed-token]` (a base64 JSON part and a signature, such as
  `v1.eyJ….sig` WebSocket tickets), `[redacted:aws-key]`, `[redacted:private-key]`,
  `[redacted:stripe-key]`, `[redacted:github-token]`, `[redacted:slack-token]`, `[redacted:google-key]`, and
  `[redacted:card]` (13 to 19 digits, spaces or dashes allowed, first digit 3 to 6, Luhn valid). The patterns are
  `VALUE_PATTERNS` in `core/src/redact-values.ts`.
- **SQL parameters** are redacted by their name or by the column the SQL binds them to (compared with, set to, or
  inserted into), so `"t"."token" = $1` hides the first value. Placeholders are `$1`, `?`, `%s` (by position) and
  `@name`, `:name`, `%(name)s` (by name). A column matches a redact key or `email`. The parser is `paramColumns` in
  `core/src/redact-sql-params.ts`; the `params` vectors run in the TS, .NET, Go, and Python tests.

## Packages

Every SDK sends the packages it runs once at start: `POST {hub}/_wizelens/api/packages` with the hub token or ingest key
as `Authorization: Bearer`, body `PackagesReport` (`core/src/packages.ts`): `{ sender: HubSender, packages: { ecosystem,
name, version }[] }`, at most 5000. The set replaces the service's last one; a package it still runs keeps its first seen
time. Answers 204, or 400 with what is wrong. A failed send retries up to 5 times, a minute apart. `WIZELENS_PACKAGES=false`
(or `reportPackages: false`, `ReportPackages = false`) turns it off. Sources, with OSV ecosystem names:

| SDK | Ecosystem | Read from |
|---|---|---|
| Node | `npm` | `node_modules` (npm, yarn, and pnpm `.pnpm` layouts, nested to 4 levels) |
| .NET | `NuGet` | the app's `deps.json`, `package` libraries |
| Python | `PyPI` | `importlib.metadata.distributions()` |
| Java | `Maven` (`groupId:artifactId`) | `META-INF/maven/**/pom.properties` in class path jars, and in `BOOT-INF/lib` and `WEB-INF/lib` jars inside them |
| Go | `Go` | `debug.ReadBuildInfo()` dependencies, with replacements |

Hubs keep them in SQLite (`service_packages`), the cloud in Postgres (migration `PACKAGES_MIGRATION`).

**The check.** Hosts with the `packages` capability (hub unless `--no-osv` / `WIZELENS_HUB_OSV=0`, cloud unless
`--no-osv` / `WIZELENS_CLOUD_OSV=0`) send OSV (`POST https://api.osv.dev/v1/querybatch`, up to 1000 package versions
a round) every package version not checked for a day, every 5 minutes, and fetch each new advisory once
(`GET /v1/vulns/{id}`, up to 200 a round). Only ecosystems, names, and versions leave the host. The cache is shared by
every project (`package_checks`, `advisories`). OSV `database_specific.severity` maps CRITICAL and HIGH to `error`,
LOW to `info`, and the rest (MODERATE, none) to `warning`.

**On the Security page.** Each package version with advisories is a `vulnerable-package` group (A03): key
`vulnerable-package|ecosystem|name|version`, shape `ecosystem name@version`, the worst advisory's severity, the services
that run it as `endpoints`, `count` the advisories, `exampleTraceId` null, and `advisories` (`{ id, summary, severity,
aliases, fixed, url }[]`, `fixed` the versions that fix it for this package). The description names the highest fixed
version. `scan` is `{ packages, services, checkedMs }` (null without the capability). Hosts pass `packages` and
`packageScan` in the page context; under "All projects" each project's services carry its label and one version's
entries merge. `find_security_issues` adds `advisories` (`{ id, severity, fixed }[]`) to a package's row.

## Analysis (shared logic, same results in .NET and JS)

- **Duplicate query**: ≥ 2 `db` spans in one trace with identical `db.query.text` AND identical `wizelens.db.parameters`.
  A span with placeholders in its text (`?`, `$1`, `%s`, `%(name)s`, `:name`, `@name`) and no `wizelens.db.parameters`
  (the OpenTelemetry agents sanitize SQL) is never a duplicate: its values are unknown. Neither is one whose parameters
  hold a redacted value.
- **N+1 query**: ≥ 5 (configurable) `db` spans in one trace with identical `db.query.text` (params may differ).
- **Session statements** (`SET`, `RESET`, `BEGIN`, `START TRANSACTION`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`,
  `DISCARD`, `USE`) are never duplicates or N+1. Apps that set `SET LOCAL app.tenant_id` per query repeat them by design.
- **N+1 HTTP**: ≥ 5 `http.client` spans in one trace with the same method + host + path shape
  (path shape = path with numeric / guid segments and query values replaced by `{}`).
- **Slow query**: `db` span with `durationMs` ≥ 100 (configurable).
- **Database wait** (dashboard and HUD): 3 or more slow queries in one trace that overlap in time are one `db-wait` finding,
  not 3 slow queries. So is a slow session statement on its own (a `SET` does almost no work, so it waited).
  Its time is wall time: queries that waited together waited once. The MCP `find_slow_queries` tool still lists each query.

## Security analysis

Security findings are `Finding`s with the kinds below (`docs/SECURITY-PLAN.md`). `analyzeTrace` returns them; `insightsOf`
leaves them out, so request health and insight counts do not change. Shared vectors: `docs/security-vectors.json`.
Each kind has one OWASP Top 10:2025 category (`OWASP_OF`). Findings name what was found, never a secret value.

- **The request** is the entry server span (`entryServerSpan`). Its response headers are known when it has any
  `http.response.header.*` attribute; rules that read them skip a request without. It is **HTTPS** when `url.scheme` is
  `https` or the first `x-forwarded-proto` value is `https`.
- **Inputs** of the request: `url.query` values (decoded, `+` is a space), path values (each `{name}` or `:name` segment of
  `http.route` against the same segment of `url.path`, decoded), and the string and number leaves of
  `wizelens.request.body` when it is complete JSON (depth 5, 100 values). A value counts when it is 3 to 200 characters,
  or 2 or more digits, and is not a redaction marker.
- **`sql-injection`** (error): a SQL `db` span (not NoSQL) whose `db.query.text` has a literal equal to an input.
  Literals: `'...'` strings (`''` is a quote; leading and trailing `%` trimmed), and numbers after `=`, `<>`, `!=`, `<=`,
  `>=`, `<`, `>`, or `IN (`. One finding per query text; shape the query text.
- **`missing-headers`** (warning): a 2xx answer with headers known that lacks `x-content-type-options`; with a
  `text/html` content type, also `content-security-policy` and `x-frame-options` (unless the CSP has
  `frame-ancestors`); over HTTPS, also `strict-transport-security`. Shape: the missing names, sorted, joined by `, `.
- **`version-header`** (info): `x-powered-by`, `x-aspnet-version`, or `x-aspnetmvc-version` present, or `server` with
  `\d+\.\d+`. Shape `name: value` (value cut to 80), one per header.
- **`cors`** (warning): `access-control-allow-origin` is `*` and `access-control-allow-credentials` is `true`, or it is
  `null`. Shape `access-control-allow-origin: *, with credentials` or `access-control-allow-origin: null`.
- **`cookie-flags`** (warning): each cookie in `http.response.header.set-cookie` (split at `, ` before `name=`), unless it
  is redacted whole or has `Max-Age=0`. Missing `Secure` over HTTPS or with `SameSite=None`; missing `HttpOnly` when the
  name matches `sess|sid|auth|token|jwt|login|remember|identity|\.aspnetcore\.`. Shape `cookie {name}: missing HttpOnly, Secure`.
- **`secret-in-url`** (warning): the request's `url.query`, or an `http.client` span's `url.full` query, has a key that is
  a default redact key. Shape: `{method} {route or path}?{key}={}` with only those keys for the request, `httpShape` for a call.
- **`plain-http`** (warning): an `http.client` span to `http://` (`url.full`, else `url.scheme`) whose host is public:
  not `localhost`, `::1`, an IPv4 in `0.`, `10.`, `127.`, `169.254.`, `172.16-31.`, or `192.168.`, an IPv6 in `fc`, `fd`,
  or `fe80:`, a name without a dot, or a name ending in `.local`, `.internal`, `.svc`, `.cluster.local`, or `.localhost`.
  Shape `httpShape`.
- **`ssrf`** (error): an `http.client` span whose host equals an input, or whose `url.full` starts with an input, or
  whose host equals the host of an input that is a URL. Only inputs with a `.`, `:`, or `/` count. Shape `httpShape`.
- **`stack-exposed`** (warning): a 4xx or 5xx answer whose `wizelens.response.body` holds a stack trace
  (`STACK_RE`: Python "Traceback (most recent call last)", Go "goroutine N [", Java `.java:N)`, .NET `:line N` or
  `at Name(`, Node `at name (file:N:N)`, PHP "Stack trace:" + "#0"). Shape: the endpoint.
- **`exposed-path`** (error): a 2xx answer to a sensitive path (`EXPOSED_PATHS`: `.env` and `.env.*`, `.git/`, `.svn/`, `.aws/`,
  `.ds_store`, `web.config`, `phpinfo.php`, `server-status`, `elmah.axd`, `trace.axd`, `debug/pprof`, and the
  `actuator` endpoints `env`, `heapdump`, `threaddump`, `configprops`, `mappings`, `beans`, `loggers`, `shutdown`,
  `jolokia`). Shape: the path, lower case.
- **`open-admin`** (warning): a 2xx answer to a path with an `admin`, `internal`, or `management` segment (not a
  sign-in path: `login`, `signin`, `sign-in`, `logon`), with no `enduser.id` in the trace and no `authorization`,
  `cookie`, `x-api-key`, or `api-key` request header. A GET counts only when its headers are known and it did not answer
  `text/html` (an app shell). Shape: the endpoint.
- **`secret-leak`**: redaction markers (see "Redaction") in log lines (`in logs`), span attributes and events
  (`in span data`), or `wizelens.response.body` (`in a response`; not `jwt`, which login answers send). Error, except
  `jwt` (warning). Shape `{label} {where}`, for example `Card number in logs`; count the markers.
- **`auth-guessing`** (rollups, not one trace): `sec.auth` rows (`service|endpoint|address`) with 10 or more 401 or 403
  answers in the window. Requests count there when they answer 401, 403, or 429, or their path matches
  `login|signin|sign-in|logon|auth|token|session|password|otp|2fa|mfa|verify`. One group per endpoint; high at 100.
  With no 429 at that endpoint, it says there may be no rate limit.
- **Facts** (`FACTS_VERSION` 10): `sec` (`kind|shape`, with SQL as `normalizeQuery` text; count, newest top), `sec.ep`,
  `sec.u`, per service `sec@svc` and `sec.ep@svc`, and `sec.auth`. A request's risks come from its row, a job's from
  the trace; loose traces add none. A risk found in log lines stays counted after the lines are pruned.
- **The `security` page model** (`api/models/security`): `totals` (count, high, endpoints), `prevTotals`, `found`, the 10
  `categories` with counts, `groups`, `matching`, `selected`, `issues`, `releases`, and `selectedUsers`. Params:
  `service`, `status` (as Insights), `release` (with `service`), `category` (`A01`..`A10`), `severity` (`error`,
  `warning`, `info`), `endpoint`, `q`, and `key`. Each group has `kind`, `owasp`, `severity`, `impact`, `title`,
  `description`, `shape`, `occurrences`, `count`, `endpoints`, `firstSeenMs`, `lastSeenMs`, `exampleTraceId`, and
  `addresses` (sign-in guessing only). Issue states are kept as `insight` issues with the group key.

## Timing

- **Streams.** A server span is a stream when it has `wizelens.stream`, answered `text/event-stream`, or answered 101. Its
  request time is `wizelens.stream.first_byte_ms` (0 when unknown), not the minutes it stayed open, in requests, services,
  endpoints, and releases. A client that closes a stream does not abort it. The `svc.stream` and `req.stream` stats count
  streams and their open time; the Service and Endpoint pages show them as Streams.
- **Late browser spans.** A request without a browser call is timed by its entry server span. A browser span that starts
  more than 10 minutes after its server answer ended is left out of the trace. `Server-Timing` carries
  `wl-start;desc={epoch ms}`; a page that opened more than 5 minutes after it, or came from a cache (`transferSize` 0),
  starts its own trace.

- Database and outbound times are **wall time**: spans that overlap count once. "All queries added up" is shown next to it
  when queries ran at the same time. A request can never show more database time than server time.
- Span start and end times keep sub-millisecond precision, so queries that start in the same millisecond keep their order.

## Sampling

A trace is kept by rate when `parseInt(last 8 hex digits of traceId, 16) / 2^32 < rate`, so every add-on keeps the same
traces. A trace outside the rate is held (spans, logs, remotes) until its local root span ends (no parent, or a parent in
another process); it is kept when any span has status `error` (with `keepErrors`), an `error` log line, or a non-browser span
at least `keepSlowMs` long. Otherwise it is dropped. A held trace whose root never ends is dropped after 60 s. Items that come
after the choice follow it; an error after a drop keeps the rest of the trace. Sampling applies to the store, the SQLite
file, and the hub sends alike.

The Node add-on does not keep Fastify's own per-request pino lines ("incoming request" and "request completed" at info or
below): the server span already holds the method, path, status, and time. Lines the app writes with `request.log` are kept.

## Logs outside a request (v0.10)

A log line written while no span is current (startup, background jobs, timers) is kept as a **loose** line when the add-on's
options allow it: `Logs.Outside` / `logs.outside` is on, its level is at or above `Logs.MinLevel` / `logs.minLevel`, and,
below `warn`, a random draw falls inside `Logs.SampleRate` / `logs.sampleRate` (warn and up are always kept). Trace sampling
never applies to loose lines. Categories that start with `wizelens` (and `[wizelens]` console notices) are never kept.

- Loose lines go into a **loose batch**: a trace with no spans whose id is 16 zeros plus 16 random hex digits
  (`LOOSE_TRACE_PREFIX`, `isLooseTraceId`). An add-on starts a new batch for each 5-minute window (`LOOSE_WINDOW_MS`) or when
  the batch holds its per-trace log limit (1000). `spanId` is null; service, category, attributes, redaction, and length
  limits are those of request lines.
- Loose batches are stored, persisted, and sent to the hub as ordinary traces (no new wire field). In-app stores cap them
  apart from traces: at most max(10, `MaxTraces` / 4) batches, so neither pushes the other out.
- They are not traces to list: `api/traces` summaries, trace lists, the Traces page, `trace` rollups, and `traces`/`requests`
  search leave them out. Their lines are on the Logs page, in `logs` search, and in `full=true` reads. A Logs row of a loose
  line has an empty `traceName`.
- The Logs page filter `origin=request|outside` (list filter `logOrigin`) keeps one side.

### Log patterns

`logPattern(message)` takes the first line, masks uuids (`<uuid>`), quoted values (`<str>`), hex and mixed ids (`<id>`),
and numbers (`<num>`), collapses spaces, and cuts it at 200 characters. `patternIdOf(message)` is its 14-hex-digit hash. Log
facts carry it in `fact_logs.pattern`; the list filter `pattern` (URL `pattern=`) keeps one pattern. The `log.p` rollup counts
lines by `service␟level␟pattern␟origin` (`r` or `o`), with the newest line as its top (`{ pattern, message, category, traceId }`).
`log`, `log.s`, and `log.p` are the log kinds (`LOG_KINDS`): they follow the log retention.

## Not traced

- CORS preflights (`OPTIONS` with `Access-Control-Request-Method`). The browser sends them with no `traceparent`, so they
  could never join a trace, and in a cross-origin app they are half of all requests.
- Health checks: a `User-Agent` that starts with `kube-probe/`, `GoogleHC/`, `ELB-HealthChecker/`, or
  `GoogleStackdriverMonitoring-UptimeChecks`. They come every few seconds with the same answer, and buried every visit in
  the trace list. The request runs with tracing off, so no framework or database span starts a trace of its own.

## Clocks

- The browser sends `sentAt` (its `Date.now()`) with each `POST api/client-spans`. When the server's clock differs by more
  than 10 s, the add-on moves the posted span starts, event times, and log times by the difference. Without `sentAt`,
  times are kept.
- Building a trace, a span that starts before its parent in the same service starts with its parent. A server span that
  starts outside the call from another service that started it is moved inside that call. A server span with no parent counts as
  started by the one browser call in another service whose `url.full` path is its `url.path`: a cross-origin fetch sends no
  `traceparent` and joins the server's trace from `X-WizeLens-Trace`. Only the clock uses this; the parent links stay as sent.

## MCP tools (read-only, phase 1)

Server name `wizelens`. Disabled by default. Every call is written to the app log as an audit line.

| Tool | Args | Returns |
|---|---|---|
| `list_traces` | `limit?=20`, `minDurationMs?`, `status?`, `q?`, `range?=24h` | Node hosts: TraceItem[] (`{ traceId, path, durationMs, health, status, services, startMs, spanCount, slow }`); .NET: TraceSummary[] |
| `get_trace` | `traceId`, `federate?=true` | Trace (spans + logs, redacted) |
| `find_slow_queries` | `thresholdMs?=100`, `limit?=20`, `range?=24h` (Node hosts) | `{ traceId, spanId, durationMs, query, service }[]`, slowest first |
| `find_security_issues` | `severity?=info` (lowest: error, warning, info), `limit?=50`, `range?=24h` | `{ kind, owasp, severity, title, shape, endpoints, requests, count, lastSeen, exampleTraceId }[]`, most severe first, then most requests. Node hosts read the `security` page (status all), else the traces in memory; .NET reads its traces |
| `find_n_plus_one` | `minRepeats?` (the project's threshold), `limit?=20`, `range?=24h` | Node hosts: groups `{ kind: "db"\|"http", shape, endpoints, requests, repeats, totalMs, lastSeen, exampleTraceId }[]`, most time first: from the insight stats at the project's threshold, else from the requests with that many calls (up to 200 read whole). .NET: `{ traceId, kind, shape, count, totalMs }[]` |
| `get_errors` | `limit?=20`, `range?=24h` (Node hosts) | `{ traceId, spanId, service, name, message, type, stack }[]` |
| `search` | `q`, `kind?=requests`, `range?=24h`, `limit?=20`, `cursor?` | SearchPage (below) plus `tags` (tag names per row, as `api/tags/match` answers) and `unknownTags`; a bad `q` is an error with `start`/`end` |
| `list_tags` | none | `{ name, query, builtIn, enabled }[]`: the names `tag:` reads |
| `search_fields` | `field?`, `prefix?`, `range?=24h` | `{ value, help?, count? }[]` |
| `get_overview` | `range?=24h` (1h, 6h, 24h, 7d) | Hub and cloud. `{ window, stillSettling, requests, errorRatePercent, avgDurationMs` (each `{ value, previous, changePercent }`), `needsAttention, services, exceptions, topErrors` (10, most first), `insights }`, from the overview, services, and errors page models. On a multi-project cloud reader with no `project`: `{ range, totals, projects[] }`, one report per project, those needing attention first |
| `get_timeseries` | `range?=24h` (1h, 6h, 24h, 7d, 30d) or `from` + `to` (ISO 8601), `service?`, `endpoint?`, `buckets?=24` (16, 24, 48) | Hub and cloud, from the `traffic` page model. `{ window: { from, to, stillSettling }, scope: { service, endpoint, found }, bucketMinutes, totals, points[] }`; totals and each point are `{ requests, errors, errorRatePercent, avgMs, p95Ms }`, points with `start`. Without `endpoint` and `service`: every request (`req`); with `service`: that service (`svc`); with `endpoint`: that endpoint (`svc.ep`), of one service or all. On a multi-project reader with no `project`: `{ projects[] }`, one per project |
| `group_requests` | `range?=24h` or `from` + `to`, `service?`, `sort?=requests` (requests, errors, errorRate, p95, avg), `limit?=50` (up to 200), `minRequests?=0` | Hub and cloud, from the `traffic` page model. `{ window, endpoints, requests, shown, rows[] }`: `endpoints` and `requests` count every endpoint kept by `minRequests`; each row is `{ project?, service, endpoint, requests, errors, errorRatePercent, avgMs, p95Ms }` for the endpoints of APIs and web apps (`svc.ep`). With no `project` on a multi-project reader, across every project |
| `list_problems` | `range?=24h` (1h, 6h, 24h, 7d) | Hub and cloud. `{ window, baseline, problems, ongoing, list[] }` from the problems page model: each problem `{ id, title, started, ended, ongoing, services, suspectedCause, otherCauses, anomalies[] ({ metric, service, endpoint, started, ongoing, value, normal, alertsAbove }), moreAnomalies }`, ongoing first. On a multi-project cloud reader with no `project`: `{ range, projects[] }` |
| `get_page` | `page`, `params?` (text values), `range?=24h` | Node hosts. Any dashboard page model (overview, services, service, endpoint, requests, traces, errors, error, database, query, insights, logs, rendering, route, users, user) with its parameters, as `api/models/<page>` answers. In-app: from the app's own traces |
| `get_alerts` | none | Hub and cloud. `{ firing, rules, events }`: rules with channel kinds only (no URLs or keys), newest 50 events |
| `list_projects` | none | Cloud, when the reader has more than one project; the hub, when it holds more than one (the one with no project is "default"): `{ id, name }[]` |

Every tool that takes a search expands `tag:` with the host's tags first.

On the hub, the cloud, and the Node add-on, `list_traces`, `get_errors`, and `find_slow_queries` read the whole store
through search (the newest traces in memory are merged in, since the store indexes a trace once it goes quiet), not the
newest 500 traces. `find_slow_queries` reads up to 5,000 matching queries, newest first, and returns the slowest.

## Issue states

Hosts with the `issues` capability keep a state per error group (`kind: "error"`, key `service|type|message`) and per
insight (`kind: "insight"`, the insight key): `open`, `resolved` (with the time), or `ignored` (until a time, or for good),
and an assignee (cloud). A resolved issue that happens after it was resolved is **regressed**. The hub answers
`GET api/issues?project=` and `POST api/issues?project=`; the cloud answers `GET api/projects/:project/issues` (with the
members issues can be assigned to) and `POST api/projects/:project/issues` (members who can write; each change writes an
audit line `issue.<action>`). A POST body is `{ kind, key, action: "resolve" | "ignore" | "reopen" | "assign", untilMs?, assignee? }`.

The Errors model takes `status` (`unresolved` by default, `resolved`, `ignored`, `all`) and `new=1` (first seen in the
range), and returns `issues` (status, first seen over all kept data, new, assignee) and `hasIssues`. The Insights model
takes `status` the same way. The Overview model returns `freshErrors`, the newest new and regressed groups.

## NoSQL calls

Redis, MongoDB, and Elasticsearch calls are `db` spans with `db.system.name` redis, mongodb, or elasticsearch,
`db.operation.name`, and `db.query.text` with ids and values as `?` (Redis `GET user:?`, Mongo `find orders {"status":?}` from
Node or the command JSON from .NET, Elasticsearch `GET /orders/_doc/?`). Values are never stored. `wizelens.db.fingerprint`
(Node) or `wizelens.db.parameters` = `{"fingerprint":…}` (.NET) is a per-process salted hash of the values: the duplicate check
groups by parameters, then fingerprint. A NoSQL call with neither is never a duplicate. Redis connection and transaction commands
(MULTI, EXEC, PING, SELECT…) and MongoDB cursor and session commands (getMore, killCursors, commitTransaction…) are session
statements, never N+1; a Redis SET is not. On the Database page NoSQL operations map to SELECT, INSERT, UPDATE, DELETE, or OTHER.

## Project settings

Hosts with the `settings` capability keep per project: `slowQueryMs`, `nPlusOneThreshold`, `redactKeys` (added to the
host's list), and `retentionDays` (never longer than the host or organization keeps). Hub: `GET/PUT api/settings?project=`.
Cloud: `GET/PUT api/projects/:project/settings` (PUT needs manage). Both answer `{ defaults, settings, effective }`. Traces
settle with the project's thresholds (`TraceState.facts`, `FactOptions.nPlusOneThreshold`); writes hide the project's
keys too (`redactSignals`). Thresholds and keys apply to new data. Prunes and page ranges use the project's retention.
Hub start options: `--slow-query-ms`, `--n-plus-one`, `--redact-keys`; cloud: `--slow-query-ms`, `--n-plus-one`.

## Team (cloud)

- **Project roles:** `PUT api/orgs/:org/projects/:project/roles/:user` with `role` none, viewer, member, admin, or null.
  Only members and viewers; owners and admins keep their org role. `none` hides the project from lists, joins, apps,
  digests, and MCP. `GET api/orgs/:org` adds `projectRoles` for managers; `api/me` gives each project's `role`.
- **Keys:** `expiresInDays` (1 to 3650) and `scopes` (ingest: traces, logs, metrics; read: api, mcp) on create;
  `POST api/orgs/:org/keys/:key/rotate` with `graceHours` (0 to 168, default 24) returns the new secret and `oldExpiresMs`.
- **Audit:** `GET api/orgs/:org/audit?limit=&offset=&before=&from=&action=&actor=` (`action` ending in "." is a group),
  `GET api/orgs/:org/audit/count` (`{ total }` for the same filter), `GET api/orgs/:org/audit/facets`,
  and `GET api/orgs/:org/audit/export?format=csv|json` with the same filter (plan gated).

## Users

Requests carry the signed-in user (`enduser.id`), from the entry server span, else from any span of the trace that has one (a
browser span). Facts keep `usr` (per user: requests, failures, durations; the top is the newest display name, `user.full_name`
else `user.name`, not `[redacted]`), and one key per item
and user for error groups (`err.u`), insights (`ins.u`), and endpoints (`ep.u`, `service|endpoint|user`), so pages count distinct
users. The Error and Endpoint pages return `users` (`{ count, top }`), Insights `selectedUsers` for its `key`. Errors and Logs
take `user` (Requests already did). The `users` page lists users by requests (`q`, `page`, `size`); the `user` page (`user`) has
their totals, requests over time, newest and slowest requests, and the error groups they hit. User rows carry `name`. `FACTS_VERSION` 6.

## Saved views and dashboards

Hosts with `saved` keep items per project at `api/saved?project=` (hub) or `api/projects/:project/saved` (cloud):
`{ kind: "view" | "search" | "dashboard", name, href, panels, chart, shared }`. Views and searches keep a dashboard address (`href`,
starting `#/`) with its filters and time range; dashboards keep up to 24 charts. A search of the Logs page (`href` `#/logs?…`, with
the filters `level`, `exact`, `service`, `category`, `q`, `pattern`, `origin`) with `chart: true` is drawn on the Logs page as a
chart of the lines it matches (Log Metrics); `chart` is false on every other item. The Logs page saves its charts here
(shared with the project by default on the cloud), so they are saved searches too: in the sidebar, Search, and Ctrl+K. A chart (`panels[]`) has 1 to 6 metrics
(`{ name, stat }`), a `type` (`line`, `area`, `bar` stacked, `number`, or `table`), a `where` filter (`key=value`, comma-separated,
`service` included), a `group` to split lines by, and a `width` (1 half, 2 whole). On the cloud an item belongs to the person who
made it and is shared with the project only when `shared`; on the hub every item is shared. The metrics model takes `where` too
and returns it with `values`, the values each key has (at most 50 per key).

## SLOs and Apdex

An SLO covers one service (display name) or one endpoint of it, over the last 7 or 30 days. A request is good when it did not
fail (`kind: "success"`), or did not fail and took at most `thresholdMs` (`kind: "latency"`, from the duration histograms, so
within about 4%). `target` is the percent that must be good (above 0, below 100). The error budget is the bad requests the target
allows; `budgetLeft` is 1 minus the bad requests over that budget (0 is spent, below 0 is over). The burn rate over a window is the
bad share over the allowed bad share: 1 spends the budget exactly over the SLO's window. Hosts answer `GET api/slos?project=` (hub)
or `api/projects/:project/slos` (cloud) with every SLO's report (status over its window, with 48 buckets of good share and budget
left, and the burn rate over the last 1 and 6 hours) and the Apdex targets; `POST` adds one, and `GET`, `PATCH`, and `DELETE` work
on `…/slos/:id`. An alert rule with `metric: "slo"` and `sloId` watches an SLO's burn rate over its own window.

Apdex scores requests against a target time per service (`GET` and `PUT api/apdex?project=` or `api/projects/:project/apdex`,
`{ apdex: { service: ms } }`; 500 ms without one): at or under the target is satisfied, under four times it tolerating, and
slower or failed requests frustrated; the score is (satisfied + tolerating / 2) / all. The Overview model returns `apdex` for the
services that run your code, each against its own target, and the Service page returns the service's.

## Search (v0.9)

The Requests, Traces, and Logs page models read `q` in the search language too. Free words keep the old text filter; a
search with fields, attributes, `NOT`, or `OR` makes the host run it (up to 1000 trace ids; `searchIds` on the page context) and
the list keeps only those traces. Hubs, the cloud, and in-app hosts (in the browser) all do it. The Search page counts every kind
(up to 1000 each, "1000+" past that) and shows when the chosen kind's results happened, through the same `api/search`.


One language on every host; the grammar, fields, and plan are in docs/SEARCH-PLAN.md, the shared test cases in
docs/search-vectors.json (the TS and .NET suites both run them). Hosts with the `search` capability answer:

| Endpoint | Params | Returns |
|---|---|---|
| `GET api/search` | `q`, `kind` (requests, traces, spans, logs), `range` or `from`/`to` (epoch ms), `env`, `project` (hub, cloud), `limit` (1–200, default 50), `cursor` | `{ kind, items, next, tookMs, settling, unknownTags }`; 400 `{ ok: false, error, start?, end? }` |
| `GET api/search/suggest` | `field` (none: fields and attribute keys; `service`; `@user.id`; `tag`: the host's enabled tags), `prefix`, `range`, `limit` (1–50) | `{ items: { value, help?, count? }[] }` |

- Items: RequestItem, TraceItem, SpanItem (`traceId, spanId, startMs, durationMs, service, name, kind, category, status,
  method, path, route, httpStatus, user`), or LogRow. Order: newest first, then trace id and part (span id or log index)
  in code-unit order. `next` is an opaque cursor; pass it back for the next page.
- Text matches are case-insensitive "contains"; `field:value` is case-insensitive equality; `*` is any text. A field a kind
  does not have never matches (so `-field:x` does). Request and trace text includes their spans' error messages; their
  `@attribute` filters match any span of the trace.
- `tag:name` stands for the tag rule `name` OR the app tag `@wizelens.tag.name:*`; `tag:key:value` is the app tag
  `@wizelens.tag.key:value`; `tag:pat*` is every rule whose name fits; `tag:*` is any rule. Hosts expand it before the search
  runs, so every engine sees plain fields. `unknownTags` lists names after `tag:` that no rule has.
- Hub and cloud: settling writes one `fact_search` row per request, trace, span, and log line, and one `fact_attrs` row
  per present attribute value (lowercased, cut at 512 characters, plus its number). Both come from the same document
  builders as the memory search, so all hosts return the same results.

## Source maps (v0.10)

Browser stacks from a production build are minified. Every host maps them back to the original source; the raw stack is
always kept as sent (`exception.stacktrace`).

**Release.** The browser package sends `service.version` on every browser span: the `release` prop (React), or
`globalThis.__WIZELENS_RELEASE__` that the build plugins set. Uploaded maps are stored per project, release, and file, so a
stack finds the maps of the build that threw it.

**Upload.** `POST api/sourcemaps?release=<version>&file=<path>` with the map JSON as the body (`Content-Encoding: gzip`
allowed), at most 64 MB after unzip. `file` is the minified file's path as served, for example `assets/index-abc.js` (no
origin, query, `~/`, leading slash, or `..`; a trailing `.map` is dropped). Answers `201 { release, file, bytes }`; 400 when
the body is not a v3 source map or `release`/`file` is missing. The same release and file replace the old map. Each project
keeps its newest 20 releases; older ones are dropped on upload. `GET api/sourcemaps[?release=]` answers
`{ maps: { release, file, bytes, uploadedMs }[] }`, newest first. The cloud authorizes both with an ingest key
(`Authorization: Bearer wl_ik_...`) and stores into the key's project; the hub takes its token (when set) and an optional
`project` (default `""`, which every project also reads). `@wizeworks/lens-cli` (`lens-cli sourcemaps upload <dir>`) and its
Vite, webpack, and Next.js plugins send every `*.js.map` below a build folder this way, each keyed by the script whose
`sourceMappingURL` names it (Turbopack names maps apart from their scripts), else by the map's own name without `.map`.

**Matching.** A frame's script URL matches a stored file when its path, or a trailing part of it, equals the file:
`https://shop.test/app/assets/index-abc.js` tries `app/assets/index-abc.js`, `assets/index-abc.js`, then `index-abc.js`; the
longest match wins.

**No upload (hub and in-app Node).** Maps are also read from build folders (hub `--sourcemaps <dir>`, Node
`sourceMaps: { dirs }`) by the same path rule (the `.map` next to the file, or the one its `sourceMappingURL` names), and from
dev servers on this machine: the host fetches the script (only `localhost`, `127.x`, `::1`, `*.localhost`, plus Node
`sourceMaps.origins`), follows its `sourceMappingURL` (inline `data:` maps too), or tries `<script>.map`. The browser package
does the same for scripts on the page's own origin (`resolveFrames`, default on). Hosts without the `sourcemaps` capability
(.NET) get resolved stacks from the dashboard, which reads the maps the site serves.

**Grouping.** When a browser error arrives (browser package, Node `api/client-spans`, hub and cloud `api/ingest`), the first
frame that a map covers and that is app code (not `node_modules` or bundler runtime) is written to the exception event as
`wizelens.error.frame` = `<source>:<function>` (the function holding the line, read from the map's `sourcesContent`; the
line number when there is none), for example `src/cart/Checkout.tsx:applyCoupon`. A host never replaces a frame already
set. The error group key is `service|type|message shape`, plus `|<frame>` for browser errors that have one, so the same
message thrown in two places is two groups, and one error stays one group across builds. Errors whose map was not found keep
the key without a frame. This changed the facts: `FACTS_VERSION` 7.

**Resolve on read.** `POST api/sourcemaps/resolve` (`?project=` on the hub and cloud) with `{ stack, release, traceId?,
spanId? }` (the stack cut at 64 KB) answers `{ frames: ResolvedFrame[] }`. The maps are those of the project the error belongs
to: on the hub, the project its trace was sent to (so "All projects" resolves too); on the cloud, the project its span was sent
to among the projects the caller may join (a browser error on another project's trace page). Without `traceId`, or when it is
not found, `?project=` decides. The dashboard sends the error's `traceId` and `spanId` from the errors panel, the error page,
and the trace page's Errors tab.

```ts
interface ResolvedFrame {
  raw: { fn: string | null; url: string; line: number; column: number; raw: string }; // the frame as sent
  source: string | null;   // original file for display; null when no map covers the frame
  line: number | null;     // 1-based original line and column
  column: number | null;
  fn: string | null;       // the function holding the line, or the raw name
  inApp: boolean;          // false for node_modules and bundler runtime
  context: { start: number; lines: string[] } | null; // 3 lines before and after, from sourcesContent
}
```

Stack lines in Chrome, Edge, and Node (`at fn (url:line:col)`), Firefox, and Safari (`fn@url:line:col`) formats are read;
native and `eval` frames are skipped. Index maps (`sections`) and `sourceRoot` are supported.
## Tags (v0.10)

A tag is a rule: a name, a color, and a search (docs/TAGS-PLAN.md). Hosts keep rules in settings, never in telemetry, and
check them each time data is shown, so a tag covers old and new data alike and outlives what it matched.

- `TagRule`: `{ id, name, color, query, builtIn, enabled }`. `name`: 1–40 of `a-z 0-9 - _`, starting with a letter or digit,
  unique. `color`: `blue`, `green`, `amber`, `orange`, `red`, `violet`, `slate`. `query`: 1–2000 characters of the search
  language that parse, match less than everything, and never use `tag:`. At most 50 rules per project (hub: per hub).
- Built-ins, ids `builtin:{name}`, on until turned off; only `enabled` changes: `stream` (`text/event-stream` responses),
  `probe` (Kubernetes, Google, and AWS health checks by user agent), `bot` (crawlers by user agent). Their searches are in
  docs/search-vectors.json, and both suites check them.
- `GET api/tags` → `TagList` `{ tags: TagRule[] (built-ins first, then by name), editable, max }`. In-app: the `tags` option,
  read-only. Hub: `POST` `{ name, color, query }`, `PATCH /{id}` (what is sent changes; a built-in takes only `{ enabled }`),
  `DELETE /{id}`; 400 answers `{ ok: false, field, error }`.
- `POST api/tags/match` `{ kind, items: { traceId, owner, timeMs }[] }` → `{ matches: { "traceId owner": name[] } }`, rows
  without a tag left out, names in rule order. `owner` is the span id (spans), log index (logs), or `""`. Each enabled rule runs
  as a search of `kind` over just those traces, from an hour before the first `timeMs` to an hour after the last, on the host's
  own engine, so a tag shows exactly where the same search finds the row. The dashboard gives trace rows the tags their request
  matches too (route and user are request fields).
- Rows that count many requests (endpoints, services, error groups) show a rule only when every field it names describes the
  row: `service`, `method`, `route`, `path` (endpoints); `service` (services); `service`, `error`, and free words on the type and
  message (error groups). The dashboard checks these itself with the same compiler.

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
| On or off | `Enabled` | `enabled` | `WIZELENS_ENABLED` (`true`/`1`/`on`/`yes`, `false`/`0`/`off`/`no`) |
| Dashboard | `Dashboard` | `dashboard` | `WIZELENS_DASHBOARD` (same words) |
| HUD on served pages | `Hud` | `hud` | `WIZELENS_HUD` (same words; default on, only while the dashboard is served) |

**Send-only.** The dashboard is on in development and off elsewhere (.NET: outside the Development environment; Node: when
`NODE_ENV=production`), unless the option or variable says otherwise. With it off, only `POST {basePath}/api/client-spans`
answers (and its CORS preflight); every other path under `{basePath}` (UI, `api/info`, `api/traces`, metrics, MCP) is a 404.
Storage defaults to memory, MCP is off, and `sender.endpoint` is left out of every `IngestBatch`, so the hub never tries to
read from the service. The browser package skips its reads (`api/traces`) when `hud` is false, or `"auto"` and `api/info` does not answer
(`readServer` follows `hud`). A send-only add-on puts no HUD on its pages.

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
| POST | `/_wizelens/api/ingest` | `IngestBatch`. Browser errors get `wizelens.error.frame` first (see "Source maps") |
| POST / GET | `/_wizelens/api/sourcemaps` | Upload one map, or list them; `project` is optional (`""`). See "Source maps" |
| POST | `/_wizelens/api/sourcemaps/resolve` | `{ stack, release, traceId?, spanId? }` → `{ frames }`; the maps of the trace's project, else `?project=` |
| POST | `/v1/traces`, `/v1/logs`, `/v1/metrics` | OTLP/HTTP, JSON or protobuf, optional gzip. Also under `/_wizelens/v1/...` |
| GET | `/_wizelens/api/models/metrics` | The Metrics page: `range`, `project`, `env`, `service`, `metric`, `group`, `stat`, `q`. Read from the metric rollups (see "Metrics"), with no point cap |
| GET | `/_wizelens/api/models/hosts`, `/_wizelens/api/models/kubernetes` | The Hosts and Kubernetes pages (see "Hosts and Kubernetes"): `range`, `project`, `env`, `host`, `node`, `pod`, `cluster`, `ns`, `workload`, `service`, `q` |
| GET | `/_wizelens/api/models/{page}` | One page model (see "Page models"): `range`, `project`, `env`, and the page's own parameters. Ranges up to the hub's age limit. `serverStats` |
| POST | `/_wizelens/mcp` | With `--mcp`. The same tools, over the newest 2000 traces of every service, plus `list_metrics`, `get_metric`, `get_overview`, `list_problems`, `get_timeseries`, and `group_requests` |
| GET / POST | `/_wizelens/api/uptime?project=` | `UptimeList` / add a check (`project` in the body). See "Uptime checks". 404 with `--no-uptime` |
| PATCH / DELETE | `/_wizelens/api/uptime/{id}` | Change (only the fields sent) or delete a check |
| POST | `/_wizelens/api/uptime/{id}/run` | Run a check now; answers the check |
| GET / POST / PATCH / DELETE | `/_wizelens/api/tags[/{id}]` | Tag rules for the whole hub (see "Tags"). Changes only from the hub's own pages (a request with an `Origin` of another site gets 403), and with the token when one is set |
| POST | `/_wizelens/api/tags/match` | `?project=&env=`; see "Tags" |
| GET | `/healthz` | `ok` |

Uptime changes with an `Origin` header must come from the hub's own origin, so another site open in the browser cannot add
checks to a hub without a token.

`HubService` is the sender plus `via` (`"addon"`, `"otlp"`, or `"uptime"` for the host's own checks), `firstSeenMs`, `lastSeenMs`, and `online` (heard from in the
last 30 seconds). OTLP apps send only when they have data, so the dashboard shows a quiet OTLP app as "Idle", not "Offline".

There is one row per service, environment, and host, so each Kubernetes pod is its own row. The dashboard groups them into
one row per service; a click shows the hosts, and hosts offline for more than a day hide until asked for. The hub drops rows
not heard from within its retention; the cloud does the same with each organization's retention.

Trace `remotes` that point at a service which sends to the hub are hidden, so the dashboard does not read that service twice.

### OTLP mapping

- Resource `service.name` → service; `service.namespace` (or `wizelens.project`) → project;
  `deployment.environment.name` (or `deployment.environment`) → environment; `host.name` (or `k8s.pod.name`) → host;
  `k8s.cluster.name`, `k8s.namespace.name`, `k8s.pod.name`, `k8s.node.name` → `k8s`. Host and Kubernetes resource
  attributes are copied onto metric points and spans (see "Hosts and Kubernetes").
- Span kind, status, events, and attributes map one to one. Category uses the same rules as the add-ons.
- Older attribute names are copied to the current ones when the current one is missing: `http.method`, `http.status_code`,
  `http.url`, `http.target`, `http.scheme`, `db.statement`, `db.system`, `db.name`, `db.operation`, `net.peer.name`, `net.peer.port`.
  Also `http.user_agent`, `http.client_ip`, `http.flavor`, `http.request_content_length`, `http.response_content_length`,
  `db.sql.table` / `db.mongodb.collection` / `db.cassandra.table` / `db.cosmosdb.container` (→ `db.collection.name`),
  `net.host.name`, `net.host.port`, `net.sock.peer.addr`, `net.sock.peer.port`, `messaging.operation`,
  `messaging.destination`, `code.function`, `code.filepath`, `code.lineno`. The first older name wins.
- `url.path` that holds a query (from `http.target`) is split into `url.path` and `url.query`.
- Captured headers: a list value is joined with `, `, and `_` in the name becomes `-` (`http.request.header.content-type`).
- SQL parameters: `db.query.parameter.<key>` (Java agent) become `wizelens.db.parameters`, a JSON array when every key
  is a position, else an object, redacted by name and column (see "Redaction"); the per-key attributes are removed. Python's
  `db.statement.parameters` (the `str()` of a tuple or dict) is read as JSON the same way, or kept as text (redacted
  whole when it names a secret). A value an SDK already set wins.
- A `db` span whose parent in the same export is also a `db` span (an ORM over its driver, such as SQLAlchemy over
  sqlite3) becomes `internal`, so the query counts once; its parameters move to the parent when the text matches.
- Log records keep their trace id. Records without one (startup, jobs) go into a loose batch: `looseTraceIdOf(project|service|environment|host, time)`, one per source and 5-minute window, with `spanId` null.
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
CREATE TABLE sourcemaps (project TEXT, release TEXT, file TEXT, map BLOB, bytes INTEGER, uploaded_ms REAL,
                       PRIMARY KEY (project, release, file));                                            -- map gzipped
CREATE TABLE saved (id TEXT PRIMARY KEY, project TEXT, kind TEXT, json TEXT, created_ms REAL);        -- SavedItem as JSON
CREATE TABLE tag_rules    (id TEXT PRIMARY KEY, name TEXT UNIQUE, color TEXT, query TEXT, created_ms REAL, updated_ms REAL);
CREATE TABLE tag_builtins (name TEXT PRIMARY KEY, enabled INTEGER);                                     -- built-ins turned off
```

Log retention: `--log-retention <time>` (`WIZELENS_HUB_LOG_RETENTION`, default `--retention`). Each prune drops loose batches
older than it (through the trace prune, so they leave the rollups), raw log rows older than it, their `fact_logs`, `logs`
search rows, and log attributes, and the log kinds' rollup buckets past it. Loose batches do not count toward
`--max-traces` and are not pruned by `--retention`; the 1 h tier ages trace kinds by `--retention` and log kinds by
`--log-retention`. `fact_logs` gained `pattern` (added to older files when opened).

Metric points older than the trace age limit are dropped, then the oldest past `--max-metric-points`
(`WIZELENS_HUB_MAX_METRIC_POINTS`, default 2,000,000). That cap is for raw points only: the metric rollup tiers drop buckets past
their keep (10 s and 5 min tiers) or the trace age limit (1 h tier and `metric_series`) once a minute. A file from before metric
rollups gets its stored raw points rolled up once, oldest first, for half a second each minute (`meta('metric_backfill')` holds
the progress, then `done`); points that arrive meanwhile are rolled up as usual.

Schema version 3 adds the stats tables (see "Stats tables"): `traces` gains `settled_ms` and `contrib`, and the fact, rollup, hist,
and metric rollup tables use `project` in place of `project_id` (`''` for unknown), SQLite types, and keys that start with the
trace id (facts) or `(kind, bucket_ms, project, env, key)` (rollups), since hub reads often have no project. Files from older hubs
upgrade by themselves when opened: the new columns and tables are added, and the settle job backfills the stats, newest traces
first. The hub settles every 2 seconds for at most 150 ms at a time. Pruning by age or by count takes the dropped traces out of
the rollups. Page answers are cached per page, parameters, scope, 10-second "now", and settle generation (200 entries).

Schema version 4 adds `uptime_checks` (one row per check: its settings, `project`, `state`, the newest result, `tls_expires_ms`,
and `next_ms`) and `uptime_incidents` (`check_id`, `start_ms`, `end_ms` or null while open, `reason`). Results themselves are
traces. Incidents that ended more than 90 days ago are dropped.

## Cloud (v0.7, phase 3)

`@wizeworks/lens-cloud` (command `wizelens-cloud`, default port **5970**) is the hosted service. It serves the same dashboard,
answers `mode: "cloud"` with `capabilities: ["environments", "registry", "accounts", "alerts", "sharing", "serverStats",
"metrics", "serverMetrics", "search", "changes", "issues", "infra", "uptime", "statusPages", "sourcemaps", "slos", "saved", "tags", "settings"]`,
and keeps data in Postgres (`DATABASE_URL=postgres://...`). PGlite (`pglite:<folder>` or `memory`) runs the same SQL in-process,
for tests and trials.

### Tenancy and access

Accounts, sessions, organizations, members, and invites are [Better Auth](https://better-auth.com) 1.7 (pinned), mounted at
`/_wizelens/api/auth/*`. The cloud keeps only what Better Auth has no place for: projects, ingest and read keys, share links,
retention, and the audit log.

- **Organizations** hold **projects**. People join organizations with a role: `owner`, `admin`, `member`, `viewer`.
  Viewers read. Members also make alerts, tags, and share links. Admins also manage projects, keys, members, and invites. Owners also
  manage owners and delete the organization. The roles are plain data in `@wizeworks/lens-core` (`ACCESS_STATEMENTS`,
  `ROLE_GRANTS`); the cloud and the dashboard both build Better Auth access control from it. An organization always keeps one owner:
  Better Auth checks it, and a deferred database trigger (`members_keep_owner`) refuses any change that would leave none.
- **Sessions**: email and password, or a passkey. Sessions live in the database only (no cookie cache), so signing out a device, a
  password reset, or a removed member takes effect on the next request. Cookie `wizelens.session_token` (`__Secure-` prefix on
  https): HttpOnly, `SameSite=Lax`, `Path=/_wizelens`, 14 days, renewed daily. Better Auth checks the `Origin` of every change
  against the public URL; the cloud also needs `X-WizeLens-Client: dashboard` on every change, so another site cannot send one.
- **Two-step sign-in**: codes from an authenticator app (TOTP, 6 digits, 30 s) with 10 one-time backup codes, both stored encrypted
  with the auth secret. After 10 wrong codes the account waits 15 minutes. A device can be trusted for 14 days. Passkeys must check
  the person on the device (`userVerification: "required"`), so they count as two factors and skip the code.
- **Passwords**: 12 to 128 characters, scrypt. Hashes from before Better Auth (`scrypt$…`) still verify and are replaced at the next
  sign-in. With `--check-pwned-passwords` (default on with Postgres), passwords found in known breaches are refused (only a
  5-character SHA-1 prefix leaves the server).
- **Email** (with `--resend-api-key` or `--smtp-url`): sign-up sends a confirm link, and sign-in waits for it. Password reset links last 30 minutes, once,
  and end every session. A new email is confirmed by the old address first, then the new one. Deleting an account is confirmed by
  email. Links open the dashboard (`#/verify-email`, `#/reset-password`, `#/invite`, `#/delete-account`, all with `?token=`).
  Without mail, emails are written to the log, nothing is confirmed, and invite sign-ups must carry the invite id (below).
  `POST api/mail/resend` takes Resend's webhook (Svix signature, 5-minute window; 401 when it does not match, 404 without
  `--resend-webhook-secret`). A hard bounce (`email.bounced` with `bounce.type` `Permanent`) stops all mail to the address; a spam
  complaint (`email.complained`) stops all but account mail. Confirming the address by link clears it (table `mail_suppressions`).
- **Notices and digests**: security notices always go out. Team changes come from the audit log: a job takes new lines
  (`audit.noticed`, `FOR UPDATE SKIP LOCKED`, so instances never send twice) and emails owners and admins once per batch. Project
  health watches projects with data in 58 of the 72 hours before their last data, and tells managers after 2 quiet hours and when
  data is back (`project_health`). Digests (daily, weekly on Mondays, monthly on the 1st) go out at the person's local hour; each
  send is claimed first in `digest_sends`. `GET` and `PATCH api/me/notifications` read and change `{ team, health, digests,
  timeZone, digestHour, projects: [{ projectId, daily, weekly, monthly }] }`. `GET api/mail/unsubscribe?token=` shows a stop
  button; `POST` (also the RFC 8058 one-click call) turns that mail off. The token is signed with the auth secret.
- **Sign-up**: the first account needs the one-time setup token the cloud prints at start (`#/setup?token=`, header
  `x-wizelens-setup-token`; set it with `--setup-token` for several instances). After that, people sign up with an open invite for
  their email (7 days), or anyone when the cloud runs with `--signup open` (they get their own organization). Without SMTP, an
  invite sign-up must also send the invite id (header `x-wizelens-invite`). One gate (`user.validateUserInfo`) checks every method.
- **Invites**: the invite id is the secret in its link. It opens only for a signed-in person with the invited email (confirmed, when
  mail is on). No Better Auth route lists invites (`list-invitations` and `get-full-organization` are off; without SMTP also
  `list-user-invitations`); owners and admins see them on `GET api/orgs/{org}`.
- **Limits**: per client address, shared by every instance through the `rate_limits` table: sign-in 10 a minute, sign-up 5,
  two-step codes 10, reset and confirm links 3 per 5 minutes, SSO provider changes and DNS checks 5, everything else 120 a minute (429 above). The client address is the
  socket, or with `--trust-proxy` the last `X-Forwarded-For` entry; address headers the client sends are dropped.
- **Secret**: `--auth-secret` signs sessions and encrypts 2FA data (required with Postgres; a PGlite trial makes one and keeps it
  in its database). `2:new,1:old` rotates: encrypted data still opens, but everyone signs in again. Better Auth telemetry is off.
- **Single sign-on** (Better Auth's SSO plugin): owners and admins connect their organization's identity provider with OIDC
  (PKCE always) or SAML 2.0 (signed assertions always; responses must answer our request, carry timestamps, and use no SHA-1).
  A provider belongs to one organization and signs nobody in until its email domain is proven: a DNS TXT record
  `_wizelens-sso-<providerId>.<domain>` with the token from `sso/request-domain-verification`, checked by `sso/verify-domain`.
  New accounts come only for emails at exactly that domain (the sign-up gate checks it, also with `--signup invite`); they start
  confirmed and join the organization as members. An existing account links only when its own email is confirmed. The cloud
  fetches OIDC settings, tokens, and keys only from origins in `--sso-origins` (SAML needs none). Removing a provider removes its
  sign-ins (trigger `sso_providers_accounts_go`). Changes are in the audit log (`sso.create`, `sso.update`, `sso.delete`,
  `sso.verify`), without secrets. SSO sign-in skips our two-step codes: the identity provider does that part.
- **Leaving**: an account cannot be deleted while it is the last owner of an organization with other members. Organizations it is
  alone in are deleted with their data. An owner deletes an organization with `DELETE api/orgs/{org}` and the password.
- **Keys** (only their SHA-256 hash is stored; the prefix tells what they are):
  - `wl_ik_…` **ingest key**: one project. Add-ons send it as `WIZELENS_HUB_TOKEN`; OTLP apps as `Authorization: Bearer …`.
    The project comes from the key, never from the sender. At most 1200 calls per key per minute (429 above).
  - `wl_rk_…` **read key**: one or more projects, read-only. For scripts, CI, and agents with no person to sign in.
- **Connected apps (OAuth 2.1 for MCP clients)**, Better Auth's OAuth provider plugin (`@better-auth/oauth-provider`, pinned
  with Better Auth). An MCP client (Claude, Claude Code, Cursor) gets a 401 from `mcp` with
  `WWW-Authenticate: Bearer resource_metadata="…", scope="wizelens:read offline_access"`, reads the protected resource
  metadata (RFC 9728) and the authorization server metadata (RFC 8414, issuer `<public-url>/_wizelens/api/auth`), registers
  itself (RFC 7591, open, public clients with `token_endpoint_auth_method: none`), and signs the person in with PKCE (S256).
  Better Auth sends the browser to `#/oauth` (sign in) and `#/oauth-consent` with a signed query in the hash. On the consent
  page the person picks one organization and all its projects (also later ones) or some; `POST api/auth/wizelens/oauth-grant`
  (a sign-in from the last 15 minutes) saves that **grant** (`oauth_grants`), then `POST api/auth/oauth2/consent` ties the
  consent and every token to it (`reference_id`, claim `wl_grant`). One scope, `wizelens:read`; `offline_access` is always
  added, so a scheduled agent keeps access. Tokens are opaque and stored hashed: access `wl_at_…` (1 hour), refresh
  `wl_rt_…` (30 days, rotated on each use). A new grant from the same person to the same app ends the older one. Every MCP
  call checks the grant, the person's membership (any role reads), and the projects again, so leaving the organization or
  removing the app stops it at once. Audit: `app.connect`, `app.disconnect`, and `mcp.call` with `app`. Expired tokens,
  grants never consented to (a day), ended grants (90 days), and apps nobody connected (a day) are pruned. Client CRUD,
  introspection, userinfo, and consent routes of the plugin are off; limits: token 600 and register 60 per minute per address.
- **MCP origin** (`--mcp-url https://mcp.example.com`, `WIZELENS_CLOUD_MCP_URL`): another origin a proxy sends to MCP
  (`/` and `/mcp` to `/_wizelens/mcp`, `/.well-known/*` as is). Requests on that host get its metadata (`resource` is the
  origin, or `<origin>/mcp`) and its `resource_metadata` pointer; sign-in stays on the public URL. The hosted cloud uses
  `https://mcp.wizelens.com`.
- **SCIM provisioning** (Better Auth's SCIM plugin, `@better-auth/scim`): an admin makes a `wl_sc_…` token for the
  organization (hashed in `scim_tokens`); the identity provider calls `<public-url>/_wizelens/api/auth/scim/v2` with it.
  Each token is one connection (`org-<id>`) whose provisioning domain is the organization. A user it creates or activates
  becomes a `member`; a deactivated one leaves the organization (owners stay) and loses its sessions. An existing account
  is linked only when its email is confirmed and it is already a member or at the organization's proven SSO domain.
  Changes write `scim.user.*` and `scim.group.*` (actor `scim:<token id>`); tokens write `scim.token.create` and `.revoke`.
- **Audit log**: org changes, member and invite changes (also those through Better Auth), keys, projects, shares, and every MCP tool
  call, with who did it.

### Endpoints (below `/_wizelens/`)

| Method | Path | Who |
|---|---|---|
| GET | `api/me` | Anyone: `{ signedIn, needsSetup, signup, mail, sso, billing, user?, sessionId?, orgs?[] with projects and plan, blockingOrgs? }`. `sso`: some provider has a proven domain. `billing`: the cloud bills through Stripe; off, every `plan` is `unlimited` |
| GET | `api/invites/{id}` | Anyone with the link: `{ orgName, email, role, inviter }` |
| * | `api/auth/*` | Better Auth: sign-up, sign-in (email, passkey), `two-factor/*`, sessions, password, email, `delete-user`, `organization/*` (invite, accept, roles, remove, leave), `sign-in/sso`, `sso/*` (register with `organizationId`, providers, update, delete, domain proof; owner or admin). Send `organizationId` on every `organization/*` change |
| POST / GET / PATCH / DELETE | `api/orgs`, `api/orgs/{org}` | Signed in; read: any member; name and retention: admin; delete (with `password`): owner |
| POST / DELETE | `api/orgs/{org}/projects[/{id}]`, `…/{id}/clear` (deletes data only) | Admin |
| POST / DELETE | `api/orgs/{org}/keys[/{id}]` | Admin. The secret is in the answer once |
| GET | `api/orgs/{org}/audit?offset=&before=`, `…/audit/count` | Admin |
| GET | `api/info`, `api/traces`, `api/traces/{id}`, `api/services` — all with `?project=` (or `?project=all&org=`) | Member or read key. `api/traces/{id}` joins other projects (see "Traces across projects"); `project=all` reads every project the caller may (see "All projects") |
| PATCH | `api/orgs/{org}/projects/{p}` | Admin. `{ logRetentionDays }`: 1 to 400, or null to follow the organization. Answers the project (with `logRetentionDays`) and writes `project.update` to the audit log |
| POST | `api/projects/{p}/services/forget` | Admin. Forgets offline hosts; each service keeps its newest host. Answers `{ removed }` and writes `service.forget` to the audit log |
| GET | `api/models/{page}?project=&range=&env=&…` | Member or read key. See "Page models". `metrics` is a page too. `project=all&org=`: every project the caller may read (see "All projects") |
| GET | `api/orgs/{org}/alerts`, `/issues`, `/slos`, `/uptime`, `/shares` | Member or read key: every readable project's rows, each with `projectId` and `project` (its label). Changes stay on `api/projects/{project}/…` |
| POST | `api/orgs/{org}/issues` | Member who can write: a labeled error group's change lands in its project; an insight's in every project the caller may write |
| GET / POST / PATCH / DELETE | `api/orgs/{org}/saved[/{id}]` | The list holds the organization's own items (`projectId` "") and every readable project's; only the organization's own change here (member who can write; owner, or admin to delete a shared one) |
| GET / POST / PATCH / DELETE | `api/projects/{p}/alerts[/{id}]`, `…/{id}/test` | Read: viewer; change: member |
| POST / GET / DELETE | `api/projects/{p}/shares[/{id}]` | Read: viewer; change: member |
| GET / POST | `api/projects/{p}/uptime` | Read: viewer or read key (`UptimeList`); add: member (audited `uptime.create`) |
| PATCH / DELETE | `api/projects/{p}/uptime/{id}` | Member (audited `uptime.update`, `uptime.delete`) |
| POST | `api/projects/{p}/uptime/{id}/run` | Member. Runs the check now and answers it |
| GET / POST / PATCH / DELETE | `api/projects/{p}/status-page` | Read: viewer (`{ enabled, title?, createdMs?, views? }`); on or new link (`{ title }`, answers `{ url, title }` once), rename, off: member (audited `status.enable`, `status.disable`) |
| GET | `api/status/{token}` | Anyone with the link: `StatusPageView` |
| GET / POST / PATCH / DELETE | `api/tags[/{id}]?project=` | Read: viewer or read key (`editable` says if the caller may change); change: member (the `tag` permission). Each change writes `tag.create`, `tag.update`, `tag.delete`, `tag.enable`, or `tag.disable` to the audit log |
| POST | `api/tags/match?project=&env=` | Viewer or read key; see "Tags" |
| GET | `api/shared/{token}` | Anyone with the link: `{ trace, expiresMs }`, or for a page link `{ page, title, params, model, createdMs, expiresMs }` |
| GET / POST / GET, PATCH, DELETE | `api/projects/{p}/saved[/{id}]` | Read: viewer (own and shared items); add: member; change: the owner; delete: the owner or an admin |
| POST | `api/ingest`, `/v1/traces`, `/v1/logs`, `/v1/metrics` | Ingest key |
| OPTIONS / POST | `b/{browser key}/api/client-spans` | Browser key (`wl_bk_`) in the path, from a page whose `Origin` is one of the key's sites; CORS answers that site only. Body as the add-on's `api/client-spans` (any content type, so pages post plain text and skip the CORS check). Every span is stored as a browser span (`service` and `category` "browser", never `server` kind) and every line as a browser line. At most 500 of each per call; capped per key and per visitor address. 204 |
| PATCH | `api/orgs/{org}/keys/{id}` | Admin. `{ origins }`: a browser key's sites, changed in place (audited `key.origins`) |
| POST / GET | `api/sourcemaps?release=&file=` | Ingest key: upload one map to the key's project, or list them (see "Source maps") |
| POST | `api/sourcemaps/resolve?project=` | Member or read key: `{ stack, release }` → `{ frames }` |
| POST | `mcp?project=` | Read key or connected app (OAuth access token). Without `?project=`, a reader with one project reads it; one with several adds `list_projects` and a `project` argument (id or name) on every tool. A tool called without `project` reads every project together (services as "service · project"); `get_overview`, `get_timeseries`, `group_requests`, and `list_problems` report one entry per project |
| GET | `/.well-known/oauth-protected-resource[/_wizelens/mcp]`, `/.well-known/oauth-authorization-server/_wizelens/api/auth` | Anyone (CORS open). OAuth metadata for MCP clients |
| * | `api/auth/oauth2/*` | Better Auth's OAuth provider: `authorize`, `token`, `register`, `revoke` (apps post without the dashboard header), `consent`, `continue`, `public-client` |
| POST | `api/auth/wizelens/oauth-grant` | Signed in within 15 minutes: `{ organizationId, allProjects, projectIds, oauth_query }` from the consent page. Answers `{ id }` |
| GET / DELETE | `api/me/apps[/{id}]` | Signed in: the apps this person connected (`{ apps: [{ id, app, clientId, orgId, orgName, userEmail, allProjects, projects, createdMs, usedMs }] }`), or end one |
| GET / DELETE | `api/orgs/{org}/apps[/{id}]` | Admin: every app connected in the organization, or end one |
| GET | `api/orgs/{org}/usage` | Any member: `{ billing, plan, includedGb, maxRetentionDays, month, monthGb, days[{ day, gb, bytes, spans, logs, points }], overageUsd, projectedGb, projectedOverageUsd, spendCapUsd, blocked, reason, subscription, plans[] }` (see "Plans and billing") |
| PATCH | `api/orgs/{org}/billing` | Owner, billing on, Team or Business: `{ spendCapUsd: whole dollars or null }` |
| GET | `api/orgs/{org}/audit/export?format=csv\|json` | Admin, plan with audit export (402 otherwise): the whole log as a download; writes `audit.export` |
| GET / POST / DELETE | `api/orgs/{org}/scim`, `…/scim/tokens[/{id}]` | Admin: `{ allowed, plan?, baseUrl, tokens }`; a new `wl_sc_…` token is in the answer once (402 without SCIM on the plan) |
| * | `api/auth/scim/v2/*` | SCIM 2.0 (Better Auth's SCIM plugin): `Users`, `Groups`, `ServiceProviderConfig`, `Schemas`, `ResourceTypes`, with `Authorization: Bearer wl_sc_…` (no dashboard header) |
| * | `api/auth/subscription/*` | Better Auth's Stripe plugin, billing on: `upgrade`, `cancel`, `restore`, `list`, `billing-portal`, each with `customerType: "organization"` and `referenceId` (owner or admin); `success` (Stripe's redirect back) |
| POST | `api/auth/stripe/webhook` | Stripe, signed (`Stripe-Signature`, `--stripe-webhook-secret`); 404 with billing off |

### Page models (`serverStats`)

Every dashboard page is one definition in `@wizeworks/lens-core` (`PAGES`: overview, requests, traces, database, rendering,
errors, logs, `log-patterns` (the top 50 patterns of the Logs filter, with counts, change, and trend), `log-chart` (the lines of
one log search per bucket, its total, and its change), services, service, insights, problems, `uptime`, and `badges`, the sidebar
counts). `problems` is described under "Problems" below. `uptime` reads the `svc.ep` rollups of the `wizelens-uptime` service:
runs, failures, and average response time per check (`check`: one check id), per bucket, and in total against the window before.
`service` is the full page of one service
(`service`: a Services row key such as `api:orders`, or a name): its numbers against the window before, traffic and latency over
time, endpoints, callers, and for APIs and workers the top error groups, slowest requests, and newest log lines. A page says what it needs from its URL parameters (filters,
sort, page, selected item): rollup groups and series over the chosen window and the window before it, list rows, or one trace.
An executor answers those needs and the page builds a JSON object from the answers. In-app hosts answer them in the browser from
the loaded traces; hosts with `serverStats` answer them on the server, so ranges reach `7d` and `30d`. Lists in a model are capped
at 200 rows (Requests and Logs page through all rows). Request rows in models carry no `findings`. `meta.sampled` is always
`null`; `meta.settling` is the number of traces whose stats run behind: written over 60 seconds ago (`SETTLE_BEHIND_MS`) and
not settled yet (null when none). Every new trace waits a few seconds on purpose, so those are not counted. The dashboard says
"Stats are catching up" while it is above 0, and search's `settling` uses the same rule. The cloud caches answers for 15 seconds; the hub until its stats change.

**Period.** Every page (and `api/models/metrics`) also takes `from` and `to` (epoch ms) for a custom window; `range` then
names the smallest preset that covers it, and hosts refuse a window that starts before what they keep. `compare=week`
compares with the same window a week earlier instead of the window right before. `meta.custom` and `meta.compare` say
which; `meta.compareLabel` reads "vs. previous period" or "vs. same time last week". The dashboard keeps `range`, `from`,
`to`, `compare`, `env`, `project`, and `service` in the address bar, so a link opens the same view.

**Traffic.** `traffic` (`service`: a row key or name, `endpoint`, `buckets`: 16, 24, or 48, default 24) is for agents
(`get_timeseries`, `group_requests`): `scope`, `bucketMs`, `points` (requests, errors, error rate, average, and p95 per
bucket), `totals`, and `endpoints` (every endpoint of the APIs and web apps in scope, up to 100 services and 200 endpoints
each, busiest first). `scope.found` is false for a service with no traffic in the window.

**Detail pages.** `error` (`group`: a group key), `endpoint` (`service`: a row key or name, `endpoint`), `query` (`q`: a query
shape), and `route` (`route`) give one item's numbers over time, where it happens, and its newest traces (from the row's
newest trace ids). The dashboard shows them at `#/errors/<key>`, `#/services/<service>/endpoints/<endpoint>`,
`#/database/queries/<query>`, and `#/rendering/routes/<route>`.

**Filters.** Every page but Services and Service takes `service` (a display name: "Web App" for the browser), and its cards,
charts, and lists count that service only: requests and traces that went through it, and the queries, errors, and log lines
it wrote. The dashboard sends the service chosen in the top bar unless the link names one. Page filters, all in the URL:

| Page | Parameters |
|---|---|
| errors | `type`, `endpoint`, `critical=1`, `q`, `sort` (`recent`, `count`), `page`, `size`, `group`. The list pages through every matching group; cards and charts follow `service` only |
| database | `q`, `table`, `operation`, `database`, `sort` (`avg`, `count`, `total`), `page`, `size` |
| traces | `status` (`error`, `ok`), `duration` (as Requests), `q`, `sort` (`time`, `duration`), `page`, `size`, `trace`. Without `trace`, the first listed trace shows |
| logs | `level`, `exact=1` (that level only), `category`, `trace`, `q`, `page`, `size` |
| requests | as before, plus `endpoint` (exact), `user`, `insights=1`, and sorts `errors` and `db` |
| insights | `area`, `impact`, `q`, `endpoint`, `key` |
| rendering | `q` (route or component name) |

### Stats tables (hub and cloud)

Pages read small tables built from the stored traces, never the traces themselves (only `selected` traces are read whole).
- **Facts**, one set per trace: `fact_requests` (a request row without findings), `fact_traces` (a Traces list row),
  `fact_logs` (log lines), `fact_critical` (the 5 slowest spans of each trace). Lists filter, sort, and page these.
- **Rollups**: what a trace adds to every grouping a page shows (`kind`, `key`), summed per time bucket in three tiers:
  `rollup_10s` (kept 6 h 10 min), `rollup_5m` (kept 50 h), `rollup_1h` (kept for the retention). Each row has `n`, `err`,
  `sum_v`, counters `c0`..`c5`, `first_ms`, `last_ms`, and one representative (`top`, `top_rank`) and newest trace ids (`ids`).
  `hist_<tier>` holds a log-bucket histogram per row (bins 4% wide, so percentiles are within 2%).
- A query reads the coarsest tier that still gives a window enough buckets, and finer tiers at the window's edges; an edge
  bucket that no kept tier can split is weighted by its overlap. Series place each tier bucket by its midpoint, or spread it
  over the page buckets it overlaps when page buckets are not whole tier buckets.
- **Settling**: a trace is settled when it has been quiet for 5 seconds (or every 30 seconds while it keeps changing): its facts
  are rebuilt from its spans and logs, and the rollups get its new contribution minus the old one (kept as JSON in
  `traces.contrib`). `settled_ms` is set to the `updated_ms` that was read, so a late span settles the trace again. Representatives,
  first and last times, and ids are display fields and are never taken back out.
- **Query spread** (`FACTS_VERSION` 14): `db.q` and `db.qd` keep histograms, so the Database list, its CSV, and the Query page show
  each query shape's p95 next to its average and max.
- **One version fact** (`FACTS_VERSION` 8): the `svc.v` kind (traces per service and version, added in 7 for Problems) is
  gone; Problems reads `rel` below, so one release fact feeds markers, compare versions, and "new release" causes.
- **Releases** (`FACTS_VERSION` 5): `rel` counts each span that starts work in its service (no parent, or a parent in another
  service) under `service|version`, from the span's `service.version`, with a histogram. Hosts copy `sender.release` onto the
  sender's spans that have no version (OTLP: the resource's `service.version`). `HubSender.version` stays the add-on's own
  version. Every page's `meta.releases` lists the versions first seen in its window (chart markers); the Service page has
  `versions` (requests, error rate, p95, and error groups first seen while each was the newest); Errors and Insights take
  `release` with `service` (groups first seen while that version was the newest) and return the service's `releases`.
- **Endpoints** (`FACTS_VERSION` 4): `ep.call` and `ep.q` file each outgoing call and query under the endpoint (`svc.ep` key
  head) whose http.server span it ran under. `svc.ep` and `edge` keep histograms (p50/p95/p99), and `svc.ep`, `db.q`, and
  `pv.route` keep their newest trace ids. List needs take `traceIds`.
- **Per-service copies** (`FACTS_VERSION` 3): the kinds in `SCOPED_BASE` (`req`, `req.part`, `trace`, `ins`, `ins.ep`,
  `bn.*`, `db*`, `err`, `err.t`, `err.e`) also write a `<kind>@svc` row keyed by the service first. A need with `service`
  reads that copy and gets its keys back without the service. `db.qd` keys a query shape by operation and database first.
  Group needs can also filter keys by text (`contains`, ASCII case-insensitive), keep rows over a value (`having`), and skip
  rows (`order.offset`).
- The slow query threshold is fixed when a trace settles (100 ms). `FACTS_VERSION` in `@wizeworks/lens-core` names the fact
  rules: when it changes, a host clears its stats and rebuilds them (hub: `meta('facts')`; cloud: `scale_meta('facts')`).
- Times are those of each item (request start, span start, log time), so an item near a window edge counts where it happened.
- **Metric rollups** (`metric_series`, `metric_10s` / `5m` / `1h`) use the same tiers and reads, but are written when points
  arrive, not by settling, since points never change (see "Metrics").

### Alerts

The hub and the cloud both run alert rules (the hub sends no email). A rule watches one metric over a window (5 min to 24 h),
optionally in one environment, and for trace metrics optionally one `service` (display name) or one `endpoint` of it
(`"GET /api/orders/{id}"`; `slow_queries` is per service only): `error_rate` (%), `p95_ms`, `avg_ms`, `requests`, `new_errors`
(error groups not seen in the window before), `slow_queries`, `new_security_risks` (security risks, `sec` keys, not seen in
the window before; per service only), and `log_count` (lines that match the rule's `logSearch`, the Logs
page filters, for example `{ "level": "error", "q": "timed out" }`; no `service` or `endpoint`, the search names its service). It
fires when the value is above (`>`), at or above (`>=`), below
(`<`), or at or below (`<=`) the threshold. No data never fires, except `requests` below (traffic stopped). Rules run every minute.
A notice is sent when the state changes (fired, resolved), and again every `remindMs` (15 min, 1 h, 4 h, or 1 day; 0 for never)
while it keeps firing and nobody acknowledged it. `POST …/:id/ack` acknowledges a firing rule (reminders stop until it resolves);
`POST …/:id/mute` with `{ untilMs }` mutes it (`-1` until unmuted, `null` unmutes): its state still changes, quietly. Turning a rule
off clears its state. Each check keeps its value (30 days); `GET …/:id?from=&to=` returns the rule, its events, and those values.
A rule sends to up to 5 channels: a webhook (the JSON notice), a Slack, Microsoft Teams (a MessageCard), or Discord incoming webhook,
PagerDuty (`{ "kind": "pagerduty", "routingKey": "…" }`, Events API v2: fired and reminders trigger one incident per rule, resolved
resolves it, a test triggers and resolves its own key), or email (cloud: `{ "kind": "email", "to": [...] }`: 1 to 20 addresses of
members of the organization, confirmed ones when mail is on, checked again at each send). Every notice, mute, and acknowledgement is
kept as an event (`fired`, `resolved`, `remind`, `test`, `ack`, `mute`, `unmute`).
The message says what happened: `Requests is 79 (above 5)` when fired, `(no longer above 5)` when resolved, `(still above 5)` for a
reminder, and `(alerts when above 5)` for a test notice. `PATCH` changes only the fields it sends.
Webhook URLs must be https and may not resolve to private, loopback, or link-local addresses, unless the cloud runs with
`--allow-private-webhooks` (self-hosting on a private network). The hub allows them by default (it runs on your own network).

**Above normal** (`op: "above_normal"`) works on `error_rate`, `p95_ms`, and `requests`. The threshold is the sensitivity: how
many spreads above normal (2 high, 3 medium, the default, 4 low; 1 to 10 allowed). The rule judges every Services row and every
endpoint over its window against the same window in earlier weeks (see "Problems") and fires when any one is above normal;
its value is that one's value. The message names it: `p95 duration is above normal on pay POST /api/charge: 412 ms (normal 31 ms,
alerts above 46 ms)`. A notice carries `baseline: { normal, upper }` for these rules (else null). In the cloud, every fired or reminder notice also carries
`problem: { id, title, cause, url }` (or null): the problem near that time on the Problems page (on the breaching service, for
above normal rules), with the suspected cause in one sentence and a dashboard link (`#/problems?project=&problem=&at=&service=`).
Slack and email show it; events keep it (`problem: { id, title, url } | null` in `GET api/projects/{project}/alerts`).

### Problems

The `problems` page model finds anomalies with plain statistics, no model or training:

- **Baselines** per Services row (`svc`) and per endpoint (`svc.ep`) for error rate (%), p95 (ms), and traffic (count per
  bucket), read from the rollups. Buckets sit on a fixed grid (1 min for 15m, 2.5 min for 1h, 15 min for 6h, 30 min for 24h,
  4 h for 7d, 12 h for 30d) from the bucket holding the window's start to the one holding now, so ids stay put as time moves.
  Each bucket is compared with the same bucket in the 4 weeks before (the same hour of the week). While fewer than two of those
  weeks have traces, it uses the 6 days before (the same hour of the day), for hosts that keep less. A key needs two earlier
  windows with data before it is judged; until the page has two, `baseline.learning` is true.
- **Above normal**: value > mean + k × spread, with k from `sensitivity` (high 2, medium 3, low 4) and the spread the larger of
  the samples' standard deviation and a floor (traffic: √mean and 10% of the mean; error rate: the binomial deviation and
  0.5 points; p95: 10% of the mean and 5 ms). A bucket needs 10 requests (traffic), 5 failures (error rate), or 10 items (p95).
  Consecutive buckets above normal make one anomaly; it is ongoing while it reaches the newest bucket (or the one before,
  while the newest has too little data).
- **Problems**: anomalies that start within 15 minutes (or two buckets) of each other on the same service, or on services
  joined in the call map (`edge`), become one problem. Its suspected cause, most telling first: a **release** (a `rel` version
  first seen up to that span before the start, or in the first bucket, and not seen in the week before the window), a **new
  error group** (first seen near the start, not in the week before), a **query** (an endpoint of a database row above normal),
  or a **downstream** service (called by others in the problem, calling none of them).
- Params: `sensitivity`, `problem` (an id), and `at` (ms) with `service` (a row key or name) to find one from a link.
  The model: `{ meta, baseline: { mode: "week"|"day", samples, learning }, sensitivity, starts, bucketMs, problems (50 at most,
  ongoing then newest), total, ongoing, anomalies, services, selected }`. A problem: `{ id, title, metric, startMs, endMs,
  ongoing, services[], anomalies (20 at most, furthest over first, each with its peak and per-bucket values, normals, and
  lines), anomalyCount, cause, causes[] }`.

A rule can also watch one OpenTelemetry metric: `metric: "metric"`, `metricName` (required), `metricStat`
(`last`, `avg`, `max`, `p95`, `p99`, or `rate`; default `avg`), and `metricService` (optional). The threshold is in the metric's
base unit (seconds, bytes, or 0 to 1 for ratios). Counters read as a rate per second; histograms read from their merged buckets.
Rules read the metric rollups over the window ending at "now" rounded down to 10 seconds. Gauge `p95` and `p99` are taken over the
bucket means of the finest tier that covers the window (10 s up to 6 hours, 5 min beyond), so they can sit slightly below the
percentile of the raw values. No data never fires.

### Traces across projects

One trace can cross projects, for example a front end in one project calling a shared API in another. `api/traces/{id}`
answers the asked project's part plus the parts of the same trace id in the other projects the caller may read:

- **Same organization only.** Projects of other organizations are never read, even when the caller belongs to both.
- **A person** sees every project of the organization that a project role does not hide (`none`). **A read key** or **connected app** sees only its own projects (checked again against the
  organization on every call, so a key row that names a foreign project still gets nothing from it).
- **404** when the asked project has no part of the trace, so a project cannot be used to probe others.
- `join=false` returns the asked project's part only. With `project=all`, every part in the caller's projects.

### All projects

The cloud reads every project of one organization at once with `?project=all&org=<organization id>` on the data
routes (traces, one trace, services, page models, metrics, hosts, Kubernetes, search, suggest, tags, changes, source
map resolve), and `api/orgs/{org}/…` for alerts, issues, SLOs, uptime, shares, and saved items.

- **Which projects.** A person reads the organization's projects a project role does not hide; a read key or
  connected app its own. 404 when that leaves none, or the caller is not in the organization.
- **One organization, three locks.** Every telemetry row carries its organization (`org_id`). Every read names the
  organization and its project list, and the code refuses one without both. Reads run as a reader the database holds
  to the named organization: ClickHouse row policies on `getSetting('SQL_wl_org')`, Postgres row level security on
  `wl.org`. A read without an organization fails; a foreign project id reads nothing.
- **Same-named services stay apart.** With more than one project, rollup rows named by a service (services,
  endpoints, edges, error groups, log groups, releases, per-service kinds) group by project and show as
  "api · Shop" (the project's name, or "name (slug)" when two share one). Other rows (levels, layers, routes,
  queries) add up across projects, as environments do. A filter that names a labeled service reads its project only.
  List and search rows carry `project` and label their services.
- **Per-project state.** Issue states and Apdex targets key on the labels; tags of every project apply (a name two
  use keeps the first). Retention is the longest of the projects; thresholds are theirs when they agree, else the
  cloud's.
- **One project only.** Settings, tag rule changes, source map uploads, Apdex targets, the status page, and share
  links belong to one project.
- MCP `get_trace` joins the same way for its read key or connected app (`federate: false`: the asked project only).

### Sharing

A share link (`#/shared/<token>`, 1 to 30 days) opens one trace, or one page, read-only, for anyone with the link. It can be
revoked. A page link (`POST …/shares` with `page`, `range`, `params`, `env`, and `title`) keeps the page's model as it was when the
link was made (at most 2 MB): Overview, Requests, Errors, an error, Database, a query, Logs, Insights, Rendering, a route,
Services, a service, an endpoint, and Traces. `api/shared/{token}` answers `{ page, title, params, model, createdMs, expiresMs }`.
Views are counted. Nothing else is reachable with the token. The trace is joined as far as the link's maker may read at
the time it is opened: after the maker leaves the organization, the link shows only the shared project's part.

### Uptime checks

Hubs and the cloud call URLs on a schedule (`uptime` capability). A check (`UptimeCheckInput` in `@wizeworks/lens-core`, the same
rules on both): `url` (http or https, no credentials in it), `method` (GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS), `headers`
(up to 20), `expectStatus` (`"200"`, `"200-299"` (default), or a list like `"200,301-302"`), `expectBody` (text the body must
contain; not with HEAD), `intervalMin` (1 to 60), `timeoutMs` (1 to 60 s), `env`, `enabled`, and `name`. At most 100 per project
(hub: per hub). Redirects are followed (up to 5) unless `expectStatus` names a 3xx code. The body is read up to 1 MB.

- **A run** passes when the status matches and the body holds the text. It keeps `state` (`pending` until the first run, `up`,
  `down`), the last status, time, duration, error, and the end of the TLS certificate (`tlsExpiresMs`, https only; read by a bare
  handshake that sends nothing when the certificate itself is refused). Checks run every 15 seconds when due; each due check is
  claimed first (cloud: `FOR UPDATE SKIP LOCKED`), so replicas and slow runs never run it twice.
- **Results are telemetry.** Each run is one trace with one span of category `uptime` (kind `client`) of the service
  `wizelens-uptime`, written through the normal write path in the check's project and environment: `http.request.method`,
  `http.route` = `/uptime/{checkId}`, `url.full` and `url.path` without the query string, `server.address`,
  `http.response.status_code`, `wizelens.uptime.check_id`, `wizelens.uptime.check_name`, `wizelens.uptime.ok`, and with TLS
  `tls.server.not_after` and `wizelens.uptime.tls_days_left`. A failed run has status `error`, the reason as `statusMessage`, and
  an error log line (no `exception` event); a certificate within 14 days of its end (`TLS_WARN_DAYS`) adds a warn log line.
  Runs are not app traffic: requests, services, errors, and Problems skip every span with `wizelens.uptime.check_id` (also
  runs written before as `http.server` spans). The `up` (all checks) and `up.chk` (by check id) stats feed the `uptime` page;
  Search and Logs still find runs.
- **Incidents**: a run that fails after a passing (or pending) one opens an incident with the reason; the next passing run closes
  it at its start. Turning a check off closes its open incident. Uptime for 24 h, 7 days, and 30 days is the share of time since
  the check was made not covered by incidents, so it does not depend on trace retention. Incidents are kept 90 days.
- `UptimeList`: `{ checks: (UptimeCheck & { uptime: { "24h", "7d", "30d" } })[], incidents: (UptimeIncident & { checkName })[], nowMs }`.
  Header values whose names look secret (`authorization`, `cookie`, `token`, `api-key`, ...) show as `[redacted]`; sending
  `[redacted]` back keeps the stored value. The cloud stores headers encrypted with the auth secret (`v<version>:<ciphertext>`).
- **Private addresses**: cloud checks may not reach loopback, private, link-local, carrier-grade NAT, multicast, or reserved
  addresses, checked when a check is saved and again at every connection (also after redirects and DNS changes), unless the cloud
  runs with `--allow-private-webhooks`. Hubs may reach any address their machine can; `--no-uptime` turns checks off.
- **Status pages** (cloud, `statusPages`): off by default. Turning one on makes a `wl_st_` token (only its hash is kept); a new link
  stops the old one. `#/status/<token>` shows the title, each enabled check's name and state, uptime for 24 h, 7 days, and 30 days,
  one bar per UTC day for 30 days, and incident times of the last 30 days: never URLs, headers, or error text.

### Retention

Each organization keeps traces for `retention_days` (default 30, 1 to 400). Older traces are deleted every 10 minutes. Each
project keeps log lines for `projects.log_retention_days` (1 to 400; null follows the organization): the same job drops loose
batches, raw log rows, log facts, log search rows and attributes, and the log kinds' rollup buckets past it, and the 1 h tier ages
only the other kinds by the organization's retention.
`POST …/projects/{id}/clear` deletes a project's data now.

### Plans and billing

Billing is off unless the cloud starts with `--stripe-secret-key` (then `--stripe-webhook-secret` and `--stripe-prices`,
JSON of `teamMonthly`, `teamAnnual`, `businessMonthly`, `businessAnnual`, `overage`, `meter`, are required, and so is
`--public-url`). Off, every organization is `unlimited`: no caps, no gates, no billing UI. Plans live in
`cloud/src/billing/plans.ts`:

| Plan | Included GB a month | Retention max | Overage | SSO, SCIM, audit export |
|---|---|---|---|---|
| `free` | 10 (then 429) | 14 | no | no |
| `team` | 50 | 30 | yes | no |
| `business` | 150 | 90 | yes | yes |
| `enterprise` | `orgs.plan_gb` (none: no limit) | `orgs.plan_retention_days`, at most 400 | no | yes |
| `unlimited` | none | 400 | no | yes |

- **Usage**: the request body of `api/ingest` and OTLP as sent (before gzip is undone), counted only when accepted, plus spans,
  logs, and metric points, per organization per UTC day in `usage_daily`. Counters flush every minute and at shutdown. A GB
  is 10^9 bytes. Months are calendar months in UTC.
- **Free cap**: at the included GB, ingest and OTLP answer 429 `{ error: "This organization reached the Free plan's 10 GB
  for this month. …" }` with `Retry-After: 3600` until the 1st or an upgrade. **Spend cap** (Team, Business): past
  `spend_cap_cents` of overage, 429 "This organization reached its monthly spend cap of $N. …". The first block of a month
  writes `ingest.blocked`. Mail to owners and admins at 80% and 100% of the included GB and at the spend cap, once a month each
  (`usage_notices`).
- **Overage**: graduated on the GB above the included GB each month: 500 GB at $0.30, 1,500 GB at $0.20, then $0.10.
- **Gates**: SSO provider setup (`sso/register`, `sso/update-provider`) answers 402 `PLAN_REQUIRED`; SCIM tokens stop
  working and their routes answer 402; audit export answers 402 with `{ plan }`. Retention above the plan's maximum answers
  402; a plan change lowers retention to the new maximum.
- **Stripe** (Better Auth's Stripe plugin, the organization is the customer and the subscription's `reference_id`):
  Checkout starts Team or Business, monthly or yearly; the customer portal changes, cancels, and holds cards and invoices.
  Webhook events (`checkout.session.completed`, `customer.subscription.created|updated|deleted`) update `subscriptions`, then
  `orgs.plan` follows: `active`, `trialing`, or `past_due` keeps the paid plan (a failed payment keeps it through Stripe's
  retries); otherwise Free. Plans set by hand (`enterprise`, `unlimited`) stay without a subscription. Changes write
  `plan.change`. A paid organization also gets a **usage subscription**: only the graduated metered price on the
  `wizelens_gb` meter, monthly, anchored to the 1st (UTC), metadata `wizelensRole: usage`; the webhook handles its events
  itself (it is remade if it ends while the plan runs) and passes every other event to the plugin. Five minutes after each UTC
  day ends, the whole GB above the included GB since the 1st, less what was reported that month, goes to the meter as one event
  per organization and day (`identifier: wl-<org>-<day>`, `usage_reports`), so a rerun never bills twice. When the plan ends,
  finished days are reported, then the usage subscription is canceled with a final invoice.
- **Commands**: `wizelens-cloud stripe-setup` makes the products, prices (lookup keys `wizelens_team_monthly`, …,
  `wizelens_gb_overage`), the meter, and the webhook, and prints the options. `wizelens-cloud plan set <org> <plan>
  [--gb N] [--retention-days N]` sets a plan by hand (audit actor `cli`).

### Cloud storage

Postgres, one schema, migrations in `wizelens_migrations`. Tables: `orgs`, `users`, `members`, `sessions`, `invites`, `accounts`,
`verifications`, `two_factors`, `passkeys`, `rate_limits`, `cloud_meta`, `sso_providers`, `projects`, `api_keys`, `traces`, `spans`, `logs`, `services`, `metric_points`, `alert_rules`, `alert_events`, `shares`, `audit`, `tag_rules`, `tag_builtins`.
Migration 2 added `metric_points` and the metric columns of `alert_rules`. Migration 5 added `sso_providers`. Migration 3 added the stats tables (see "Stats
tables"): `traces.settled_ms` and `traces.contrib`, `scale_meta`, `fact_requests`, `fact_traces`, `fact_logs`, `fact_critical`,
`rollup_10s`/`5m`/`1h`, `hist_10s`/`5m`/`1h`, `metric_series`, and `metric_10s`/`5m`/`1h`. The cloud settles every 3 seconds in batches
of 500, under a Postgres advisory lock so only one instance works at a time. Rollup buckets age out every minute; the 1 h tier
follows the organization's retention, and deleting traces past retention takes them out of the rollups first. Metric rollups are
written at ingest under row locks on `metric_series` (`SELECT ... FOR UPDATE`, in key order), so instances add up the same series
one at a time; their tiers age out with the 10-minute retention job (the 1 h tier and `metric_series` by the organization's
retention). Migration 4 moved accounts to Better Auth: its tables use our snake_case names (`auth/schema-names.ts` maps them), and
users, organizations, and members kept their rows and ids. Passwords moved to `accounts`, sessions started over, and open invites got
new ids (so new links). A test checks that Better Auth finds nothing to change in the schema, and Better Auth checks it again at start.
Data tables are keyed by `project_id`. Times are `double precision` epoch ms, except in Better Auth's tables (`timestamptz`). Our
secrets (keys, shares, status page links) are stored as SHA-256 hashes only; Better Auth stores reset and confirm tokens hashed. Migration 8 added
`fact_search` and `fact_attrs` (see "Search"). Migration 9 added OAuth for MCP clients. Migration 10 added `issues`. Migration 11 added the alert changes (see "Alerts"). Migration 12 added SLOs. Migration 13 added saved views and page shares. Migration 14 added billing:
`orgs.plan` (existing organizations `unlimited`), `plan_gb`, `plan_retention_days`, `spend_cap_cents`, `stripe_customer_id`,
`overage_subscription_id`; `users.stripe_customer_id`; Better Auth's `subscriptions`; `usage_daily`, `usage_notices`,
`usage_reports`; and `scim_tokens` (hashed `wl_sc_…`). Migration 15 added the SCIM plugin's tables in snake_case
(`scim_users`, `scim_groups`, `scim_group_members`, `scim_subjects`, `scim_projection_grants`, `scim_identity_tombstones`,
`scim_connection_bindings`); their provisioning domain is the organization id. Migration 16 added `tag_rules`
(per project, unique name) and `tag_builtins` (the built-ins a project turned off); they stay in Postgres in scale mode too.
Migration 17 added `uptime_checks`, `uptime_incidents`, and `status_pages` (see "Uptime checks"). Migration 18 added
`sourcemaps` (see "Source maps"). Migration 19 added `fact_logs.pattern`, `projects.log_retention_days`,
`alert_rules.log_search`, and `saved_searches`. Migration 20 added `alert_events.problem` (see "Problems"). Migration 22 moved
every `saved_searches` row into `saved_items` as a shared `search` of the Logs page with `chart: true` (owner: the user who saved
it), and dropped `saved_searches`.

### Telemetry stores (small mode and scale mode)

Everything about spans, logs, metrics, and their stats goes through one interface (`TelemetryStore`, `cloud/src/telemetry`).
Postgres keeps accounts, organizations, projects, keys, the service registry, alerts, shares, and the audit log either way.

- **Small mode** (default): telemetry in the same Postgres or PGlite, as above. For self-hosting, trials, and tests.
- **Scale mode** (`--clickhouse <url>`, `WIZELENS_CLOUD_CLICKHOUSE_URL`): telemetry in ClickHouse 26.8. Raw `spans_raw` and
  `logs_raw` (ReplacingMergeTree by version), `trace_heads` and the rollup, histogram, and metric tiers (AggregatingMergeTree: sums
  add, extremes keep extremes, `top` is `argMax` by rank, `ids` the newest by time), and fact tables (ReplacingMergeTree with
  tombstones, so a trace settled again drops the rows it no longer has). Views with the Postgres names read the merged rows (`FINAL`),
  so the shared SQL (dialect `ch`) answers pages, lists, searches, and metrics with the same results; the parity tests run the same
  cases on memory, SQLite, Postgres, and ClickHouse. Rows expire by TTL at their organization's retention (written with each row;
  a retention change moves it with a background mutation). Log rows (raw lines, `fact_logs`, `logs` search rows, log attributes,
  loose batches, and the log kinds' rollup rows) expire by the project's log retention, never past the trace retention for a line
  in a request; `project_retention.log_days` remembers it. One cloud process writes telemetry: its settle queue lives in memory and
  is rebuilt on start from the update log of the last 6 hours. `wizelens-cloud copy-telemetry` copies a small-mode database into
  ClickHouse once (projects already there are skipped). Deployment: `deploy/README.md`, "ClickHouse".
  Every ClickHouse call of a process (or settle worker thread) takes one of `WIZELENS_CLOUD_CLICKHOUSE_CONCURRENCY` slots
  (default 24); more calls wait in line, so no burst passes ClickHouse's own limit.
