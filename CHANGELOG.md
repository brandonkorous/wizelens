# Changelog

All notable changes to WizeLens. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.2.0-alpha.1] — Phase 2: the local hub

One place for the traces of every service. Each add-on still keeps its own store and dashboard.

### Hub (`@wizeworks/lens-hub`)

- `npx @wizeworks/lens-hub` or `docker run -p 5960:5960 -v wizelens:/data ghcr.io/brandonkorous/wizelens-hub`.
- The full dashboard (`mode: "hub"`), the read API, a health check, and the read-only MCP endpoint (`--mcp`) over every service.
- One SQLite file (`~/.wizelens/hub/hub.db`): the newest 50,000 traces or 7 days (`--max-traces`, `--retention`).
- OTLP/HTTP intake at `/v1/traces` and `/v1/logs`: JSON or protobuf, gzip, older attribute names mapped. Any OpenTelemetry app can send.
- A service registry: online, idle, or offline; project, environment, host, runtime, and how it sends.
- Projects and environments: `WIZELENS_PROJECT` (OTLP: `service.namespace`) groups services. The top bar filters by both.
- Still federates to services that do not send to it. Hides remotes it already has, so nothing is read twice.
- Local only by default. `--host 0.0.0.0 --token <text>` for a team network (bearer header, or a one-time browser link that sets a cookie).
- `--import <file>` copies an add-on's `.wizelens/traces.db` into the hub.

### Add-ons

- .NET (`HubUrl`, `HubToken`, `Project`) and Node (`hub`, `hubToken`, `project`), or `WIZELENS_HUB`, `WIZELENS_HUB_TOKEN`, `WIZELENS_PROJECT`:
  send every span, log, and remote to the hub each second, with a heartbeat, a bounded queue, back-off, and one warning when the hub is down.
  Calls to the hub are never traced.
- `api/info` reports `project` and `hub`. The in-app Settings page links to the hub.
- Node: browser spans with the `messaging` category are kept (they were turned into `browser`).

### HUD

- Minimize to the WizeLens icon. The choice survives a refresh.

### Project

- The hub image is built and checked in CI. A version tag pushes it to GHCR.

## [0.1.0-alpha.1] — Phase 1: the in-app add-on

The first release. WizeLens runs inside each app, keeps its own traces, and serves the dashboard at `/_wizelens`.

### Capture

- **ASP.NET Core** (`WizeLens.AspNetCore`): requests, routing and handler time, outgoing `HttpClient` calls, `ILogger` logs, exceptions,
  request and response headers, client address, user, request id, body sizes, tags (`WizeLensRequest.Tag`), optional response bodies.
- **Databases (.NET):** EF Core (`WizeLens.EntityFrameworkCore`), any ADO.NET provider and Dapper through `ProfiledDbConnection`,
  and automatic capture of Npgsql, MySqlConnector, and Microsoft.Data.SqlClient.
- **gRPC and messaging (.NET):** Grpc.AspNetCore and Grpc.Net.Client, RabbitMQ.Client, Azure Service Bus, MassTransit, and Kafka through `WizeLens.Kafka`.
- **Node** (`@wizeworks/lens-node`): Express, Fastify, Koa, and Hono; outgoing `fetch`; routing time; logs; exceptions; the same request details and tags as .NET.
- **Databases (Node):** `pg`, `mysql2`, `better-sqlite3`, `node:sqlite`, Prisma, TypeORM, and Drizzle, one line each, plus `traceDb()` for any other driver.
- **gRPC and messaging (Node):** `@grpc/grpc-js`, `amqplib` (RabbitMQ), `kafkajs`, and `@azure/service-bus`. Trace context travels in message headers, so one trace follows a message across services.
  Pull-style receives (`channel.get`, `receiveMessages`) are recorded as receive spans. gRPC servers tell callers where their dashboard lives, so gRPC calls federate like HTTP.
- **Browser** (`@wizeworks/lens-react`): fetch spans linked to server traces, render time, page views with TTFB / SSR / FCP / LCP / INP / CLS,
  hydration, slow and oversized images, React component render stats, and browser errors.

### Dashboard

- Overview, Requests, Traces, Database, Rendering, Errors, Logs, Services, Insights, and Settings, plus a full trace page
  (timeline, SQL, HTTP, messages, logs, errors).
- Every number compares itself with the previous period. Search everything with Ctrl K. Light and dark themes. Works on phones and tablets.
- Reads every connected service and merges their traces in the browser, with clock-skew correction across services.
- Knows where it runs (`mode` and `capabilities` in `api/info`), ready for the local hub and the cloud.

### In-page HUD

- A corner card with Total, Server, Database, and Render time, health colors from the brand guide, hover cards, a small details panel,
  and links that open the full dashboard in a new tab.

### Analysis

- N+1 queries, N+1 HTTP calls, duplicate queries, slow queries, errors, render bottlenecks, and component hotspots, with the same rules in .NET and JS.

### AI access

- An opt-in, read-only, redacted MCP endpoint with five tools: `list_traces`, `get_trace`, `find_slow_queries`, `find_n_plus_one`, `get_errors`.

### Storage

- Traces survive restarts in a small SQLite file per app (newest 2,000 traces or 24 hours). Falls back to memory, and never breaks the app.

### Known limits

- Hono has no separate routing moment, so Hono requests have no routing time.
- Azure Service Bus on .NET links a processed message to its sender instead of making it a child, so the consumer starts its own trace.
- Npgsql and MySqlConnector do not report returned rows.
- Message sends and database calls are recorded inside a request (or a message handler) only. Startup and background work is skipped
  unless you turn on `traceQueriesOutsideRequests` (Node).

### Project

- CI on Linux and Windows: size rules, builds, all tests, and a trial pack. A release workflow publishes to npm and NuGet from a version tag.
- Code rules checked on every build: 250 lines per file, 50 lines per function, one-line comments.
