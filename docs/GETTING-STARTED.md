# Getting started with WizeLens

This guide takes you from zero to your first trace in about five minutes. Pick the parts that match your stack.

WizeLens is on in development only. In production it does nothing unless you turn it on yourself.

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
Each service keeps its own dashboard too. To share one hub with your team, run it with `--host 0.0.0.0 --token <text>`,
set `WIZELENS_HUB_TOKEN` on each service, and open `/_wizelens/?token=<text>` once in the browser. `wizelens-hub --help` lists every option.

## 6. AI access (optional)

Turn on the read-only MCP endpoint per service (`EnableMcp = true` / `enableMcp: true`), then point your MCP client at
`http://localhost:<port>/_wizelens/mcp`. Secrets are redacted before anything is stored. On the hub, start it with `--mcp`:
one endpoint (`http://localhost:5960/_wizelens/mcp`) then covers every service.

## Checks when something is missing

| You see | Check |
|---|---|
| No requests at all | WizeLens is mounted first (Express, Koa, Hono) and the app runs in development. |
| Requests but no queries | The database line from step 1 or 2 runs before the first query. |
| No browser timing | `import "@wizeworks/lens-react/install"` is the first import, and `/_wizelens` reaches your API. |
| A downstream service is missing | It runs WizeLens too, and the call goes through `HttpClient` / `fetch` / gRPC. |
| A service is missing in the hub | `WIZELENS_HUB` is set where the service runs, and the service was restarted. The service log says when it cannot reach the hub. |
| An OTLP app shows "Idle" | Normal: OTLP apps send only when they have data. |
| Old data after a restart | Traces are kept for 24 hours or 2,000 traces. Change `MaxAge` / `maxAgeMs` and `MaxTraces` / `maxTraces`. |

Full option lists are in the [README](../README.md#configuration). The wire format is in [CONTRACT.md](CONTRACT.md).
