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
| **1. In-app add-on** (now) | NuGet / npm package inside each app | In-memory ring buffer | Federation: the UI's host service pulls trace parts from downstream services |
| 2. Local service | One small hub on the dev machine / network | Local DB (SQLite / DuckDB) | Hub has everything |
| 3. Cloud | Hosted service | Durable, multi-tenant | Same as 2, plus teams, history, alerts |

Monetization (open core): the add-on is MIT. Cloud and team features are paid. Details later.

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
- Browser: fetch spans linked to server traces

### Analysis in phase 1

- Slow requests, slow queries
- Duplicate queries (same SQL text, same params)
- N+1 (same SQL shape or same HTTP route repeated ≥ N times in one trace)

### Not in phase 1

Local hub, cloud, auth beyond "dev only", gRPC, message queues. (Persistence, Web Vitals, React render
profiling, and the Prisma / TypeORM / Drizzle adapters were added during phase 1.)

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
