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
| `Server-Timing` | response | Appended: `wl-trace;desc={traceId}, wl-endpoint;desc="{endpoint}"`. The page reads it from the navigation entry, so the page load joins the trace of the request that rendered the HTML. |

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
| `GET /` and static files | Dashboard UI (from `@wizeworks/lens-ui` build). Hash routing: `#/`, `#/requests`, `#/traces`, `#/traces/{traceId}[/{view}]`, `#/database`, `#/rendering`, `#/errors`, `#/logs`, `#/services`, `#/insights`, `#/settings`. `{view}` is one of `timeline`, `sql`, `http`, `logs`, `errors`, `insights`. |
| `GET api/info` | `ServiceInfo` (see Types) |
| `GET api/traces?limit=50&session={id}` | `TraceSummary[]`, newest first. With `session`, only traces that have a span whose `wizelens.browser.session` equals `{id}`. Loose batches (lines outside a request) are left out of summaries on every host; `full=true` includes them. |
| `GET api/traces?full=true&limit=1000&since={ms}` | `Trace[]` from this service only (no federation), newest first. `limit` max 5000. With `since`, only traces whose last activity (`startMs + durationMs`) is at or after `{ms}`. The dashboard uses this for its charts and merges the results of every service it knows. |
| `GET api/traces/{traceId}?federate=true` | `Trace` (404 if unknown and no remote has it) |
| `POST api/client-spans` | Body `{ spans: Span[], logs?: (LogRecord & { traceId })[], sentAt?: number }`. Browser spans and browser log lines. Stored into their traces. At most 500 spans and 100 logs per call; log messages are cut at 4000 characters. 204. |
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
type Capability =
  | "federation" | "environments" | "registry" | "accounts" | "alerts" | "sharing"
  | "serverStats" | "metrics" | "serverMetrics" | "changes" | "search" | "issues"
  | "infra" | "uptime" | "statusPages" | "sourcemaps" | "savedSearches";

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
| http.server | `http.request.method`, `http.route`, `url.path`, `url.query`, `http.response.status_code`, `server.address`, `client.address` (first `X-Forwarded-For` value, else the socket), `user_agent.original`, `http.request.header.{name}` / `http.response.header.{name}` (lower-case names, values joined with `, `, max 50 headers, 1 KB each, redacted), `http.request.body.size`, `http.response.body.size`, `wizelens.request.id`, `enduser.id` (when known), `wizelens.tag.{key}` (app tags), `wizelens.server.routed_ms` (when the runtime can tell), `wizelens.response.body` + `wizelens.response.body.truncated` (only with body capture on: text and JSON, first 16 KB) |
| internal | `wizelens.layer` = `handler` for a controller action or endpoint handler span |
| gRPC (on http.server / http.client) | `rpc.system` = `grpc`, `rpc.service` (e.g. `orders.v1.Orders`), `rpc.method` (e.g. `GetOrder`), `rpc.grpc.status_code` (number). Name: `{service}/{method}`. A non-zero status code on the server is an error. |
| messaging | Kind `producer` (send) or `consumer` (receive / process). `messaging.system` (`rabbitmq`, `kafka`, `servicebus`), `messaging.operation.type` (`send`, `receive`, `process`), `messaging.destination.name` (queue, topic, or exchange), `messaging.message.id`, `messaging.batch.message_count`, `messaging.message.body.size`. Name: `{operation} {destination}`. |
| http.client | `http.request.method`, `url.full`, `server.address`, `server.port`, `http.response.status_code` |
| db | A span is `db` when it has any of `db.system.name`, `db.system`, `db.query.text`, `db.operation.name`, `db.collection.name` (some libraries, such as Better Auth, send only the operation and the table). `db.system.name` (e.g. `sqlite`, `postgresql`, `microsoft.sql_server`), `db.query.text`, `db.operation.name`, `db.collection.name`, `db.namespace`, `db.response.returned_rows`, `wizelens.db.parameters` (JSON string, redacted), `wizelens.db.adapter` (`ado.net`, `efcore`, `pg`, `mysql2`, `better-sqlite3`, `node-sqlite`, `prisma`, `typeorm`, `drizzle`, ...). An ORM span (Prisma, TypeORM) hides the driver spans under it, so a query is counted once. |
| exception event | `exception.type`, `exception.message`, `exception.stacktrace`; browser errors also `wizelens.error.frame` (see "Source maps") |
| browser (all) | `wizelens.browser.type` (`fetch` when absent, `pageview`, `react`, `error`), `wizelens.browser.session` (per-tab id, kept in sessionStorage key `wizelens.session`), `wizelens.browser.route` (path shape of the page), `url.full`, `service.version` (the app release, when the app or its build plugin sets it) |
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
| `serverStats` | The host computes page numbers itself (`api/models/<page>`); ranges reach 7 and 30 days | | ✅ | ✅ |
| `metrics` | The host keeps metrics; the Metrics page appears | ✅ | ✅ | ✅ |
| `serverMetrics` | The host computes the Metrics page itself (`api/models/metrics`). Without it, the browser reads `api/metrics/points` | | ✅ | ✅ |
| `search` | The host answers the search language (`api/search`, `api/search/suggest`); the Search page and Ctrl+K use it. Without it, the browser searches the loaded traces | ✅ | ✅ | ✅ |
| `infra` | The host answers `api/models/hosts` and `api/models/kubernetes` from OpenTelemetry Collector metrics (see "Hosts and Kubernetes"); the Hosts and Kubernetes pages appear | | ✅ | ✅ |
| `sourcemaps` | The host resolves browser stacks at `api/sourcemaps/resolve` (see "Source maps"). Without it, the dashboard resolves them in the browser from the maps the site serves | ✅ (Node) | ✅ | ✅ |
| `changes` | The host streams `api/changes?project=` (server-sent events): an `event: data` line each time the project gets new stats, at most every 2 s (the hub: each settle round), and a comment every 25 s. The dashboard reloads the open page then, keeping the old numbers on screen until the new ones arrive | | ✅ | ✅ |
| `issues` | The host keeps issue states: error groups and insights can be resolved, ignored, and (cloud) assigned. See "Issue states" below | | ✅ | ✅ |
| `uptime` | The host runs uptime checks (`api/uptime` on the hub, `api/projects/{p}/uptime` in the cloud) and serves the `uptime` page model; the Uptime page appears. See "Uptime checks" | | ✅ (unless `--no-uptime`) | ✅ |
| `statusPages` | A project can turn on a public status page (`api/status/{token}`) | | | ✅ |
| `savedSearches` | The host keeps saved searches (`api/saved-searches`). Without it, the dashboard keeps them in the browser | | ✅ | ✅ |

Add-ons answer `mode: "in-app"` and `capabilities: ["federation", "search"]`, plus `metrics` when metrics are on and `sourcemaps` (Node) unless `sourceMaps: false`. The hub
answers `mode: "hub"` and `capabilities: ["federation", "environments", "registry", "metrics", "serverMetrics", "serverStats",
"search", "changes", "issues", "infra", "sourcemaps", "savedSearches", "uptime"]` (`uptime` only while checks are on). Add-ons also report `project` and `hub` (the hub they send to) when set.

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

## Sampling

A trace is kept by rate when `parseInt(last 8 hex digits of traceId, 16) / 2^32 < rate`, so every add-on keeps the same
traces. A trace outside the rate is held (spans, logs, remotes) until its local root span ends (no parent, or a parent in
another process); it is kept when any span has status `error` (with `keepErrors`), an `error` log line, or a non-browser span
at least `keepSlowMs` long. Otherwise it is dropped. A held trace whose root never ends is dropped after 60 s. Items that come
after the choice follow it; an error after a drop keeps the rest of the trace. Sampling applies to the store, the SQLite
file, and the hub sends alike.

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
  starts outside the call from another service that started it is moved inside that call.

## MCP tools (read-only, phase 1)

Server name `wizelens`. Disabled by default. Every call is written to the app log as an audit line.

| Tool | Args | Returns |
|---|---|---|
| `list_traces` | `limit?=20`, `minDurationMs?`, `status?`, `q?`, `range?=24h` | Node hosts: TraceItem[] (`{ traceId, path, durationMs, health, status, services, startMs, spanCount, slow }`); .NET: TraceSummary[] |
| `get_trace` | `traceId`, `federate?=true` | Trace (spans + logs, redacted) |
| `find_slow_queries` | `thresholdMs?=100`, `limit?=20`, `range?=24h` (Node hosts) | `{ traceId, spanId, durationMs, query, service }[]`, slowest first |
| `find_n_plus_one` | `minRepeats?=5` | `{ traceId, kind: "db"\|"http", shape, count, totalMs }[]` |
| `get_errors` | `limit?=20`, `range?=24h` (Node hosts) | `{ traceId, spanId, service, name, message, type, stack }[]` |
| `search` | `q`, `kind?=requests`, `range?=24h`, `limit?=20`, `cursor?` | SearchPage (below); a bad `q` is an error with `start`/`end` |
| `search_fields` | `field?`, `prefix?`, `range?=24h` | `{ value, help?, count? }[]` |
| `get_overview` | `range?=24h` (1h, 6h, 24h, 7d) | Hub and cloud. `{ window, stillSettling, requests, errorRatePercent, avgDurationMs` (each `{ value, previous, changePercent }`), `needsAttention, services, exceptions, topErrors` (10, most first), `insights }`, from the overview, services, and errors page models. On a multi-project cloud reader with no `project`: `{ range, totals, projects[] }`, one report per project, those needing attention first |
| `list_projects` | none | Cloud, when the reader has more than one project: `{ id, name }[]` |

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

## Search (v0.9)

One language on every host; the grammar, fields, and plan are in docs/SEARCH-PLAN.md, the shared test cases in
docs/search-vectors.json (the TS and .NET suites both run them). Hosts with the `search` capability answer:

| Endpoint | Params | Returns |
|---|---|---|
| `GET api/search` | `q`, `kind` (requests, traces, spans, logs), `range` or `from`/`to` (epoch ms), `env`, `project` (hub, cloud), `limit` (1–200, default 50), `cursor` | `{ kind, items, next, tookMs, settling }`; 400 `{ ok: false, error, start?, end? }` |
| `GET api/search/suggest` | `field` (none: fields and attribute keys; `service`; `@user.id`), `prefix`, `range`, `limit` (1–50) | `{ items: { value, help?, count? }[] }` |

- Items: RequestItem, TraceItem, SpanItem (`traceId, spanId, startMs, durationMs, service, name, kind, category, status,
  method, path, route, httpStatus, user`), or LogRow. Order: newest first, then trace id and part (span id or log index)
  in code-unit order. `next` is an opaque cursor; pass it back for the next page.
- Text matches are case-insensitive "contains"; `field:value` is case-insensitive equality; `*` is any text. A field a kind
  does not have never matches (so `-field:x` does). Request and trace text includes their spans' error messages; their
  `@attribute` filters match any span of the trace.
- Hub and cloud: settling writes one `fact_search` row per request, trace, span, and log line, and one `fact_attrs` row
  per present attribute value (lowercased, cut at 512 characters, plus its number). Both come from the same document
  builders as the memory search, so all hosts return the same results.

## Source maps (v0.10)

Browser stacks from a production build are minified. Every host maps them back to the original source; the raw stack is
always kept as sent (`exception.stacktrace`).

**Release.** The browser package sends `service.version` on every browser span: the `version` prop (React), or
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
the key without a frame. This changed the facts: `FACTS_VERSION` 5.

**Resolve on read.** `POST api/sourcemaps/resolve` (`?project=` on the hub and cloud) with `{ stack, release }` (the stack
cut at 64 KB) answers `{ frames: ResolvedFrame[] }`:

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

**Send-only.** The dashboard is on in development and off elsewhere (.NET: outside the Development environment; Node: when
`NODE_ENV=production`), unless the option or variable says otherwise. With it off, only `POST {basePath}/api/client-spans`
answers (and its CORS preflight); every other path under `{basePath}` (UI, `api/info`, `api/traces`, metrics, MCP) is a 404.
Storage defaults to memory, MCP is off, and `sender.endpoint` is left out of every `IngestBatch`, so the hub never tries to
read from the service. The browser package skips its reads (`api/traces`) when `hud` is false (`readServer: false`).

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
| POST | `/_wizelens/api/sourcemaps/resolve` | `{ stack, release }` → `{ frames }`, with `?project=` |
| POST | `/v1/traces`, `/v1/logs`, `/v1/metrics` | OTLP/HTTP, JSON or protobuf, optional gzip. Also under `/_wizelens/v1/...` |
| GET | `/_wizelens/api/models/metrics` | The Metrics page: `range`, `project`, `env`, `service`, `metric`, `group`, `stat`, `q`. Read from the metric rollups (see "Metrics"), with no point cap |
| GET | `/_wizelens/api/models/hosts`, `/_wizelens/api/models/kubernetes` | The Hosts and Kubernetes pages (see "Hosts and Kubernetes"): `range`, `project`, `env`, `host`, `node`, `pod`, `cluster`, `ns`, `workload`, `service`, `q` |
| GET | `/_wizelens/api/models/{page}` | One page model (see "Page models"): `range`, `project`, `env`, and the page's own parameters. Ranges up to the hub's age limit. `serverStats` |
| GET / POST | `/_wizelens/api/saved-searches?project=&kind=logs` | `{ searches: SavedSearch[] }`, or save `{ name, kind?: "logs", params }` (201 `{ search }`; `params` keeps only the Logs page filters `level`, `exact`, `service`, `category`, `q`, `pattern`, `origin`). `savedSearches` |
| DELETE | `/_wizelens/api/saved-searches/{id}` | 204, or 404 |
| POST | `/_wizelens/mcp` | With `--mcp`. The same tools, over the newest 2000 traces of every service, plus `list_metrics`, `get_metric`, and `get_overview` |
| GET / POST | `/_wizelens/api/uptime?project=` | `UptimeList` / add a check (`project` in the body). See "Uptime checks". 404 with `--no-uptime` |
| PATCH / DELETE | `/_wizelens/api/uptime/{id}` | Change (only the fields sent) or delete a check |
| POST | `/_wizelens/api/uptime/{id}/run` | Run a check now; answers the check |
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
CREATE TABLE saved_searches (id TEXT PRIMARY KEY, project TEXT, kind TEXT, name TEXT, params TEXT, created_ms REAL); -- kind 'logs'
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
"metrics", "serverMetrics", "search", "changes", "issues", "infra", "uptime", "statusPages", "sourcemaps", "savedSearches"]`,
and keeps data in Postgres (`DATABASE_URL=postgres://...`). PGlite (`pglite:<folder>` or `memory`) runs the same SQL in-process,
for tests and trials.

### Tenancy and access

Accounts, sessions, organizations, members, and invites are [Better Auth](https://better-auth.com) 1.7 (pinned), mounted at
`/_wizelens/api/auth/*`. The cloud keeps only what Better Auth has no place for: projects, ingest and read keys, share links,
retention, and the audit log.

- **Organizations** hold **projects**. People join organizations with a role: `owner`, `admin`, `member`, `viewer`.
  Viewers read. Members also make alerts and share links. Admins also manage projects, keys, members, and invites. Owners also
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
- **Audit log**: org changes, member and invite changes (also those through Better Auth), keys, projects, shares, and every MCP tool
  call, with who did it.

### Endpoints (below `/_wizelens/`)

| Method | Path | Who |
|---|---|---|
| GET | `api/me` | Anyone: `{ signedIn, needsSetup, signup, mail, sso, user?, sessionId?, orgs?[] with projects, blockingOrgs? }`. `sso`: some provider has a proven domain |
| GET | `api/invites/{id}` | Anyone with the link: `{ orgName, email, role, inviter }` |
| * | `api/auth/*` | Better Auth: sign-up, sign-in (email, passkey), `two-factor/*`, sessions, password, email, `delete-user`, `organization/*` (invite, accept, roles, remove, leave), `sign-in/sso`, `sso/*` (register with `organizationId`, providers, update, delete, domain proof; owner or admin). Send `organizationId` on every `organization/*` change |
| POST / GET / PATCH / DELETE | `api/orgs`, `api/orgs/{org}` | Signed in; read: any member; name and retention: admin; delete (with `password`): owner |
| POST / DELETE | `api/orgs/{org}/projects[/{id}]`, `…/{id}/clear` (deletes data only) | Admin |
| POST / DELETE | `api/orgs/{org}/keys[/{id}]` | Admin. The secret is in the answer once |
| GET | `api/orgs/{org}/audit?before=` | Admin |
| GET | `api/info`, `api/traces`, `api/traces/{id}`, `api/services` — all with `?project=` | Member or read key. `api/traces/{id}` joins other projects (see "Traces across projects") |
| PATCH | `api/orgs/{org}/projects/{p}` | Admin. `{ logRetentionDays }`: 1 to 400, or null to follow the organization. Answers the project (with `logRetentionDays`) and writes `project.update` to the audit log |
| GET / POST / DELETE | `api/projects/{p}/saved-searches[/{id}]` | Reader lists (`?kind=logs`), writer saves or deletes. Shared with everyone who can read the project. `savedSearches` |
| POST | `api/projects/{p}/services/forget` | Admin. Forgets offline hosts; each service keeps its newest host. Answers `{ removed }` and writes `service.forget` to the audit log |
| GET | `api/models/{page}?project=&range=&env=&…` | Member or read key. See "Page models". `metrics` is a page too |
| GET / POST / PATCH / DELETE | `api/projects/{p}/alerts[/{id}]`, `…/{id}/test` | Read: viewer; change: member |
| POST / GET / DELETE | `api/projects/{p}/shares[/{id}]` | Read: viewer; change: member |
| GET | `api/shared/{token}` | Anyone with the link: `{ trace, expiresMs }` |
| GET / POST | `api/projects/{p}/uptime` | Read: viewer or read key (`UptimeList`); add: member (audited `uptime.create`) |
| PATCH / DELETE | `api/projects/{p}/uptime/{id}` | Member (audited `uptime.update`, `uptime.delete`) |
| POST | `api/projects/{p}/uptime/{id}/run` | Member. Runs the check now and answers it |
| GET / POST / PATCH / DELETE | `api/projects/{p}/status-page` | Read: viewer (`{ enabled, title?, createdMs?, views? }`); on or new link (`{ title }`, answers `{ url, title }` once), rename, off: member (audited `status.enable`, `status.disable`) |
| GET | `api/status/{token}` | Anyone with the link: `StatusPageView` |
| POST | `api/ingest`, `/v1/traces`, `/v1/logs`, `/v1/metrics` | Ingest key |
| POST / GET | `api/sourcemaps?release=&file=` | Ingest key: upload one map to the key's project, or list them (see "Source maps") |
| POST | `api/sourcemaps/resolve?project=` | Member or read key: `{ stack, release }` → `{ frames }` |
| POST | `mcp?project=` | Read key or connected app (OAuth access token). Without `?project=`, a reader with one project reads it; one with several adds `list_projects` and a `project` argument (id or name) on every tool, and `get_overview` without it reports on all |
| GET | `/.well-known/oauth-protected-resource[/_wizelens/mcp]`, `/.well-known/oauth-authorization-server/_wizelens/api/auth` | Anyone (CORS open). OAuth metadata for MCP clients |
| * | `api/auth/oauth2/*` | Better Auth's OAuth provider: `authorize`, `token`, `register`, `revoke` (apps post without the dashboard header), `consent`, `continue`, `public-client` |
| POST | `api/auth/wizelens/oauth-grant` | Signed in within 15 minutes: `{ organizationId, allProjects, projectIds, oauth_query }` from the consent page. Answers `{ id }` |
| GET / DELETE | `api/me/apps[/{id}]` | Signed in: the apps this person connected (`{ apps: [{ id, app, clientId, orgId, orgName, userEmail, allProjects, projects, createdMs, usedMs }] }`), or end one |
| GET / DELETE | `api/orgs/{org}/apps[/{id}]` | Admin: every app connected in the organization, or end one |

### Page models (`serverStats`)

Every dashboard page is one definition in `@wizeworks/lens-core` (`PAGES`: overview, requests, traces, database, rendering,
errors, logs, `log-patterns` (the top 50 patterns of the Logs filter, with counts, change, and trend), `log-chart` (the lines of
one log search per bucket, its total, and its change), services, service, insights, `uptime`, and `badges`, the sidebar counts).
`uptime` reads the `svc.ep` rollups of the `wizelens-uptime` service: runs, failures, and average response time per check
(`check`: one check id), per bucket, and in total against the window before. `service` is the full page of one service
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

A rule watches one metric over a window (5 min to 24 h), optionally in one environment: `error_rate` (%), `p95_ms`, `avg_ms`,
`requests`, `new_errors` (error groups not seen in the window before), `slow_queries`, `log_count` (lines that match the rule's
`logSearch`, the Logs page filters, for example `{ "level": "error", "q": "timed out" }`). It fires when the value is above (`>`) or
below (`<`) the threshold. No data never fires, except `requests <` (traffic stopped). Rules run every minute. A notice is sent
only when the state changes (fired, resolved), to a webhook (the JSON notice), a Slack incoming webhook, or email
(`{ "kind": "email", "to": [...] }`: 1 to 20 addresses of members of the organization, confirmed ones when mail is on, checked again
at each send), and kept as an event.
The message says what happened: `Requests is 79 (above 5)` when fired, `(no longer above 5)` when resolved, and
`(alerts when above 5)` for a test notice. `PATCH` changes only the fields it sends.
Webhook URLs must be https and may not resolve to private, loopback, or link-local addresses, unless the cloud runs with
`--allow-private-webhooks` (self-hosting on a private network).

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
- **A person** sees every project of the organization. **A read key** or **connected app** sees only its own projects (checked again against the
  organization on every call, so a key row that names a foreign project still gets nothing from it).
- **404** when the asked project has no part of the trace, so a project cannot be used to probe others.
- `join=false` returns the asked project's part only. Lists, page models, stats, and alerts stay per project.
- MCP `get_trace` joins the same way for its read key or connected app (`federate: false`: the asked project only).

### Sharing

A share link (`#/shared/<token>`, 1 to 30 days) opens one trace, read-only, for anyone with the link. It can be revoked.
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
- **Results are telemetry.** Each run is one trace with one `http.server` span of the service `wizelens-uptime`, written through
  the normal write path in the check's project and environment: `http.request.method`, `http.route` = `/uptime/{checkId}` (the
  endpoint key the `uptime` page groups by), `url.full` and `url.path` without the query string, `server.address`,
  `http.response.status_code`, `wizelens.uptime.check_id`, `wizelens.uptime.check_name`, `wizelens.uptime.ok`, and with TLS
  `tls.server.not_after` and `wizelens.uptime.tls_days_left`. A failed run has status `error`, the reason as `statusMessage`, an
  `exception` event (`UptimeCheckFailed`), and an error log line; a certificate within 14 days of its end (`TLS_WARN_DAYS`) adds a
  warn log line. So Requests, Errors, Logs, Search, the service page, and alert rules all see them.
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

### Cloud storage

Postgres, one schema, migrations in `wizelens_migrations`. Tables: `orgs`, `users`, `members`, `sessions`, `invites`, `accounts`,
`verifications`, `two_factors`, `passkeys`, `rate_limits`, `cloud_meta`, `sso_providers`, `projects`, `api_keys`, `traces`, `spans`, `logs`, `services`, `metric_points`, `alert_rules`, `alert_events`, `shares`, `audit`.
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
`fact_search` and `fact_attrs` (see "Search"). Migration 10 added `issues` (see "Issue states"). Migration 11 added
`uptime_checks`, `uptime_incidents`, and `status_pages` (see "Uptime checks"). Migration 12 added `sourcemaps` (see "Source maps").
Migration 13 added `fact_logs.pattern`, `projects.log_retention_days`, `alert_rules.log_search`, and `saved_searches`.

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
