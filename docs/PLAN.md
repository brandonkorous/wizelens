# WizeLens — Plan

A modern successor to Glimpse. It shows you what happened inside every request, across every
service, from the React click down to the SQL query. AI agents can read the same insights through
MCP, but only with permissions you grant.

## Principles

1. **OpenTelemetry-shaped data.** Every span uses OTel fields and OTel semantic-convention
   attribute names (`http.request.method`, `db.query.text`, ...). .NET uses `System.Diagnostics.Activity`
   (the OTel API in .NET). Node uses `@opentelemetry/api`. Later phases only change *where* data goes.
2. **Floor plus inspectors.** Generic capture (HTTP in/out, driver-level DB, logs, exceptions) works
   for every app. Framework adapters (EF Core, Prisma, Drizzle, ...) add richer detail on top.
3. **No ORM lock-in.** The core knows only "a database call happened". Adapters fill in detail.
4. **Microservices are first class.** Every service runs the same add-on. W3C `traceparent` links them.
5. **No built-in AI.** AI access is an opt-in, read-only MCP endpoint with redaction and scopes.
6. **Safe by default.** Enabled in Development only. Production needs an explicit opt-in.

## Roadmap

| Phase | Shape | Storage | Cross-service view |
|---|---|---|---|
| **1. In-app add-on** (complete, 0.1.0-alpha.1) | NuGet / npm package inside each app | Memory plus a SQLite file per app | Federation: the dashboard reads every connected service and merges traces |
| **2. Local hub** (complete, 0.2.0-alpha.1) | One small hub on the dev machine / network (`wizelens-hub`, npm or Docker) | One SQLite file | Hub has everything; projects and environments group it |
| 3. Cloud | Hosted service | Durable, multi-tenant | Same as 2, plus teams, history, alerts, server-side stats |

Monetization (open core): the add-on is MIT. Cloud and team features are paid. Details later.

## Phase 2 scope (complete)

| Part | What it does |
|---|---|
| HUD | Minimize to the WizeLens icon; the choice survives a refresh |
| `@wizeworks/lens-hub` | The hub: `npx @wizeworks/lens-hub` or `ghcr.io/brandonkorous/wizelens-hub`. Dashboard, API, MCP, health check |
| Ingest | Add-ons send batches (`WIZELENS_HUB`); any OpenTelemetry app sends OTLP/HTTP (JSON or protobuf) |
| Add-on senders | .NET and Node: batched, bounded queue, heartbeat, back-off, never traced, never blocks the app |
| Registry | The hub knows every service: online, idle, or offline; project, environment, host, runtime |
| Projects and environments | `WIZELENS_PROJECT` (OTLP: `service.namespace`) groups services; the dashboard filters by project and environment |
| Federation | The hub still reads services that do not send to it, through trace `remotes` |
| Access | Local only by default; a token for team networks (bearer header, or a one-time browser link that sets a cookie) |
| Import | `--import <file>` copies an add-on's trace file into the hub |
| Release | npm package, Docker image built and checked in CI, pushed to GHCR from a version tag |

Not in phase 2: server-side stats (the dashboard still computes numbers in the browser, over at most 24 hours),
user accounts, alerts, sharing. These come with the cloud.

## Phase 1 scope

### Packages

| Package | What it does |
|---|---|
| `WizeLens.AspNetCore` (NuGet) | ASP.NET Core add-on: capture, store, `/_wizelens` UI + API, MCP |
| `WizeLens.EntityFrameworkCore` (NuGet) | EF Core adapter (interceptor) |
| `@wizeworks/lens-core` (npm) | Shared types, `traceparent` helpers, analysis (N+1, duplicates, slow) |
| `@wizeworks/lens-node` (npm) | Node add-on: Express middleware, store, `/_wizelens` UI + API, DB helper |
| `@wizeworks/lens-react` (npm) | `<WizeLensProvider>`: browser spans, `traceparent` on fetch, in-page HUD |
| `@wizeworks/lens-ui` (npm, private build) | The dashboard. Built once, served by both .NET and Node add-ons |

### Captured in phase 1

- Request timeline (ASP.NET Core hosting / Express)
- Outgoing HTTP (HttpClient / fetch via undici)
- Database calls: driver level (`ProfiledDbConnection` for ADO.NET + Dapper; `pg`, `mysql2`, `better-sqlite3`, `node:sqlite`, and `traceDb()` for Node) and ORM adapters (EF Core; Prisma, TypeORM, Drizzle)
- Logs per request (ILogger / console-free logger API)
- Exceptions (ELMAH-style)
- Browser: fetch spans linked to server traces, page views and Web Vitals, hydration, React component renders, browser errors
- gRPC (server and client) and message queues (RabbitMQ, Kafka, Azure Service Bus, MassTransit), with trace context in message headers
- Frameworks: ASP.NET Core; Express, Fastify, Koa, Hono, and plain `node:http`

### Analysis in phase 1

- Slow requests, slow queries
- Duplicate queries (same SQL text, same params)
- N+1 (same SQL shape or same HTTP route repeated ≥ N times in one trace)

### Not in phase 1

Local hub, cloud, auth beyond "dev only". (Persistence, Web Vitals, React render profiling, the Prisma / TypeORM /
Drizzle adapters, gRPC, and message queues were added during phase 1.)

## Repo layout

```
docs/                 PLAN.md, CONTRACT.md
dotnet/               WizeLens.slnx, src/, tests/
js/packages/          core, node, react, ui
samples/web           React (Vite)          :5173
samples/gateway-api   .NET 10 + EF Core     :5100
samples/orders-api    Node + Express        :5200
```

Sample flow: `web` → `gateway-api` (EF Core / SQLite) → `orders-api` (node:sqlite).
The gateway has a deliberate N+1 (SQL and HTTP) so the analysis has something to find.
