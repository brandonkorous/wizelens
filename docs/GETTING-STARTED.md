# Getting started with WizeLens

This guide takes you from zero to your first trace in about five minutes. Pick the parts that match your stack.

WizeLens is on in development only. In production it does nothing unless you turn it on yourself, and then it is send-only
(see [7. Production](#7-production-send-to-the-cloud-show-nothing)).

## 1. ASP.NET Core

```bash
dotnet add package WizeLens.AspNetCore --prerelease
```

```csharp
using WizeLens;

builder.Services.AddWizeLens();   // capture, store, dashboard, API
var app = builder.Build();
app.UseWizeLens();                // early in the pipeline
```

Databases:

- **EF Core:** `dotnet add package WizeLens.EntityFrameworkCore --prerelease`, then `options.UseSqlServer(cs).UseWizeLens()`.
- **Npgsql, MySqlConnector, Microsoft.Data.SqlClient:** nothing to do. WizeLens listens to them.
- **Any other ADO.NET provider, or Dapper:** wrap the connection: `new ProfiledDbConnection(new SqliteConnection(cs))`.

gRPC, RabbitMQ (RabbitMQ.Client 7+), Azure Service Bus, and MassTransit are captured with no extra code.
For Kafka, add `WizeLens.Kafka` and use its produce and consume helpers.

Logs: `ILogger` lines are copied into the trace by themselves. Serilog and NLog need one package:

- **Serilog** (`UseSerilog()` replaces the `ILogger` providers): `dotnet add package WizeLens.Serilog --prerelease`, then
  `.WriteTo.WizeLens()` in your logger setup. In appsettings: `"Using": ["WizeLens.Serilog"]`, `"WriteTo": [{ "Name": "WizeLens" }]`.
- **NLog:** `dotnet add package WizeLens.NLog --prerelease`, then `LogManager.Setup().SetupExtensions(e => e.RegisterWizeLens())`
  and a `<target xsi:type="WizeLens" name="wizelens"/>` in `nlog.config` (or `new WizeLensTarget()` in code).

A line is never stored twice, even when `ILogger` also writes to Serilog or NLog.

Metrics: every `Meter` is read with no code: the .NET runtime, ASP.NET Core, `HttpClient`, and your own meters (the **Metrics** page).

Open `https://localhost:<port>/_wizelens`.

## 2. Node

```bash
npm install @wizeworks/lens-node
```

```ts
import { createWizeLens } from "@wizeworks/lens-node";

const wizelens = createWizeLens({ serviceName: "orders-api" });
```

Add it to your framework:

| Framework | Code |
|---|---|
| Express | `app.use(wizelens.middleware)` first, `app.use(wizelens.errorMiddleware)` last |
| Fastify | `await app.register(wizelensFastify(wizelens))` |
| Koa | `app.use(wizelensKoa(wizelens))` first |
| Hono (Node) | `app.use(wizelensHono(wizelens))` first |
| Plain `node:http` | `if (await wizelens.handler(req, res)) return;` for the dashboard, and `traceDb()` for queries |
| Next.js | `instrumentation.ts`, see below |

Next.js (App Router or Pages, `next dev` or `next start`) needs two files and no route file. `instrumentation.ts` at the
app root:

```ts
import type { Instrumentation } from "next";

export async function register() {
  // The runtime check must wrap the import, so the Edge build leaves the package out.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerWizeLens } = await import("@wizeworks/lens-node/next");
    registerWizeLens({ serviceName: "web" });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { onRequestError } = await import("@wizeworks/lens-node/next");
    onRequestError(...args);
  }
};
```

And in `next.config.mjs`: `serverExternalPackages: ["@wizeworks/lens-node"]`. The dashboard is on the Next.js port at
`/_wizelens`. Each request is one trace named by its route (`GET /items/[id]`), with Next.js's own steps (render, route
handler, fetch) inside it. Static files, hot reload, and the dev overlay are left out. After you add or update the package,
delete `.next` once.

Then your database, one line:

| Library | Code |
|---|---|
| `pg` | `instrumentPg(wizelens, pg)` |
| `mysql2` | `instrumentMysql2(wizelens, mysql)` |
| `better-sqlite3` | `instrumentBetterSqlite3(wizelens, db)` |
| `node:sqlite` | `instrumentNodeSqlite(wizelens, db)` |
| Prisma | `const prisma = new PrismaClient().$extends(prismaExtension(wizelens, { system: "postgresql" }))` |
| TypeORM | `instrumentTypeOrm(wizelens, dataSource)` |
| Drizzle | `instrumentDrizzle(wizelens, db)` |
| Anything else | `wizelens.traceDb({ system: "postgresql" }, sql, params, () => run(sql, params))` |

And, if you use them:

| Library | Code |
|---|---|
| `@grpc/grpc-js` | `instrumentGrpc(wizelens, grpc)` |
| `amqplib` (RabbitMQ) | `instrumentAmqplib(wizelens, amqplib)` |
| `kafkajs` | `instrumentKafkaJs(wizelens, kafka)` |
| `@azure/service-bus` | `instrumentServiceBus(wizelens, client)` |

Logs: `console.*` and Fastify's `request.log` are copied into the trace by themselves. For other loggers, add one line:

| Logger | Code |
|---|---|
| pino | `instrumentPino(wizelens, logger)` |
| winston | `instrumentWinston(wizelens, logger)` |
| bunyan | `instrumentBunyan(wizelens, logger)` |
| consola | `instrumentConsola(wizelens, consola)` |
| log4js | `appenders: { wizelens: { type: log4jsAppender(wizelens) } }` |
| NestJS | `NestFactory.create(AppModule, { logger: nestLogger(wizelens, new ConsoleLogger()) })` |
| OpenTelemetry logs | `new LoggerProvider({ processors: [wizelensLogProcessor(wizelens)] })` |

Metrics: CPU, memory, heap, event loop, and GC are collected by themselves (the **Metrics** page). For your own OpenTelemetry
metrics, add `new PeriodicExportingMetricReader({ exporter: wizelensMetricExporter(wizelens) })` to your `MeterProvider`.

Outgoing `fetch` calls are traced automatically. Open `http://localhost:<port>/_wizelens`.

## 3. React

```bash
npm install @wizeworks/lens-react
```

```tsx
// main.tsx: this import must come first, before React loads.
import "@wizeworks/lens-react/install";
import { WizeLensProvider } from "@wizeworks/lens-react";

<WizeLensProvider endpoint="/_wizelens" enabled={import.meta.env.DEV}>
  <App />
</WizeLensProvider>
```

`endpoint` is where your API serves WizeLens. With a dev proxy (Vite, Next.js rewrites), proxy `/_wizelens` to your API too.

When the page's own server runs WizeLens (Next.js, or any add-on that renders HTML), the page load joins that server's trace:
the server sends its trace id in `Server-Timing`, and the browser's page-load spans go to that server. Calls that another
WizeLens server on the page's origin answers work the same way, so the HUD reads each request from the server that holds it.

## 4. Several services

Install WizeLens in each service. Nothing else is needed: each response says where its WizeLens lives, so the dashboard
finds downstream services by itself and shows one trace across all of them. The environment menu in the top bar lists them.

## 5. One place for everything: the local hub (optional)

The hub keeps the traces of every service in one place, also when a service is stopped. Start it:

```bash
npx @wizeworks/lens-hub                       # or: docker run -p 5960:5960 -v wizelens:/data ghcr.io/brandonkorous/wizelens-hub
```

Then point each service at it, and restart the service:

```bash
WIZELENS_HUB=http://localhost:5960            # .NET and Node add-ons
WIZELENS_PROJECT=my-shop                      # optional: groups services when one hub holds several projects
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:5960   # any other OpenTelemetry app (Python, Go, Java, ...)
```

Open http://localhost:5960/_wizelens/. The top-bar menu filters by project and environment and shows which services are online.
The hub takes traces, logs, and metrics, so the **Metrics** page keeps 7 days of CPU, memory, and request times for every service.
Each service keeps its own dashboard too. To share one hub with your team, run it with `--host 0.0.0.0 --token <text>`,
set `WIZELENS_HUB_TOKEN` on each service, and open `/_wizelens/?token=<text>` once in the browser. `wizelens-hub --help` lists every option.

## 6. For a team: WizeLens Cloud (optional)

Run the cloud service with Postgres, on a server your team can reach:

```bash
POSTGRES_PASSWORD=<a long secret> WIZELENS_CLOUD_PUBLIC_URL=https://wizelens.example.com \
  docker compose -f deploy/docker-compose.cloud.yml up -d
```

Open the public URL and create the first account: you own the first organization. On the **Team** page, invite people
(send them the link), add projects, and make an **ingest key** per app. Then set on each app, and restart it:

```bash
WIZELENS_HUB=https://wizelens.example.com
WIZELENS_HUB_TOKEN=wl_ik_...                   # the ingest key
```

OpenTelemetry apps use `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer wl_ik_...`.
Put the cloud behind https (any reverse proxy); sign-in cookies are marked secure when the public URL is https.
To try it on your machine first: `npx @wizeworks/lens-cloud` (Postgres in-process, data in `./.wizelens-cloud`).

## 7. Production: send to the cloud, show nothing

In production, turn WizeLens on and point it at your cloud or hub. Nothing else changes in your code:

```bash
WIZELENS_ENABLED=true
WIZELENS_HUB=https://app.wizelens.com
WIZELENS_HUB_TOKEN=wl_ik_...                   # one ingest key per service
WIZELENS_SAMPLE_RATE=0.25                      # optional, see 8
```

Outside development the add-on is **send-only**: it captures and sends, but serves no dashboard, read API, or MCP, so nobody
can read traces from the app itself. Only the browser span intake (`POST /_wizelens/api/client-spans`) answers; everything
else under `/_wizelens` is a 404. Traces are kept in memory only, until they are sent. To serve the dashboard anyway (for
example on a staging server behind a VPN), set `WIZELENS_DASHBOARD=true` (`Dashboard = true` / `dashboard: true`).

In the browser, hide the HUD and keep sending page loads, React renders, and errors:

```tsx
<WizeLensProvider hud={false}>
  <App />
</WizeLensProvider>
```

With `hud={false}` the browser never reads traces back, so it works with a send-only server.

## 8. Busy services: sampling (optional)

To keep only part of the traces, set a rate between 0 and 1: `sampling: { rate: 0.1 }` (Node),
`o.Sampling.Rate = 0.1` (.NET), or `WIZELENS_SAMPLE_RATE=0.1` for both. WizeLens still keeps every trace with an error, and
every trace with a server-side span of 1 second or more (`keepErrors`, `keepSlowMs`). The choice comes from the trace id, so
every service keeps the same traces and a kept trace is whole across services. The local store, the SQLite file, and the hub
all get only the kept traces. The **Settings** page shows the rate, so read counts on other pages as part of the traffic.

## 9. AI access (optional)

Turn on the read-only MCP endpoint per service (`EnableMcp = true` / `enableMcp: true`), then point your MCP client at
`http://localhost:<port>/_wizelens/mcp`. Secrets are redacted before anything is stored. On the hub, start it with `--mcp`:
one endpoint (`http://localhost:5960/_wizelens/mcp`) then covers every service. On WizeLens Cloud, add
`https://mcp.wizelens.com` to Claude or another MCP client: it opens the WizeLens sign-in, and you pick the projects it may
read (OAuth; remove it any time under Account, Connected apps). For scripts, make a **read key** on the Team page and send
it as `Authorization: Bearer wl_rk_...`. With several projects, the agent calls `list_projects` and names a project on each
tool call, or `get_overview` with no project for a report on all of them. Every call is in the audit log.

## Checks when something is missing

| You see | Check |
|---|---|
| No requests at all | WizeLens is mounted first (Express, Koa, Hono) and the app runs in development. |
| Requests but no queries | The database line from step 1 or 2 runs before the first query. |
| Requests but no logs | Only lines written during a request are kept. Serilog and NLog apps need `WizeLens.Serilog` / `WizeLens.NLog`; Node loggers other than `console` and Fastify need the line from step 2. |
| No browser timing | `import "@wizeworks/lens-react/install"` is the first import, and `/_wizelens` reaches your API. |
| A downstream service is missing | It runs WizeLens too, and the call goes through `HttpClient` / `fetch` / gRPC. |
| A service is missing in the hub | `WIZELENS_HUB` is set where the service runs, and the service was restarted. The service log says when it cannot reach the hub. |
| An OTLP app shows "Idle" | Normal: OTLP apps send only when they have data. |
| Next.js routes all 404 after an update | Stop `next dev`, delete `.next`, and start it again. |
| Fewer requests than you sent | Sampling is on: see the **Settings** page and `WIZELENS_SAMPLE_RATE`. |
| Old data after a restart | Traces are kept for 24 hours or 2,000 traces. Change `MaxAge` / `maxAgeMs` and `MaxTraces` / `maxTraces`. |

Full option lists are in the [README](../README.md#configuration). The wire format is in [CONTRACT.md](CONTRACT.md).
