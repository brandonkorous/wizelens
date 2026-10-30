---
title: Node
description: One middleware for your framework, one line per database driver, and outgoing fetch for free.
---

## Install

```bash
npm install @wizeworks/lens-node
```

```ts
import { createWizeLens } from "@wizeworks/lens-node";

const wizelens = createWizeLens({ serviceName: "orders-api" });
```

WizeLens needs Node 22.13 or newer (24 is best). No access to the code? `node --import @wizeworks/lens-node/auto` does
the same with no code: see [Install with no code change](/docs/auto-install/).

## Your framework

| Framework | Code |
|---|---|
| Express | `app.use(wizelens.middleware)` first, `app.use(wizelens.errorMiddleware)` last |
| Fastify | `await app.register(wizeLensFastify(wizelens))` |
| Koa | `app.use(wizeLensKoa(wizelens))` first |
| Hono (Node) | `app.use(wizeLensHono(wizelens))` first |
| Plain `node:http` | `if (await wizelens.handler(req, res)) return;` for the dashboard, and `traceDb()` for queries |
| Next.js | `instrumentation.ts`, see [Next.js](/docs/nextjs/) |
| NestJS | `instrumentNest(wizelens, app)` before `app.listen()` |

Outgoing calls are traced by themselves: `fetch` and undici, and everything built on `node:http` / `node:https` (axios, got,
node-fetch v2, the AWS SDK). Each call inside a request becomes a client span with its method, URL, host, status, and timing,
and gets a `traceparent` header so the called service joins the same trace. WizeLens's own calls are not traced. Turn either
off with `instrumentFetch: false` or `instrumentHttp: false`. Express routing time is traced too. Open
`http://localhost:<port>/_wizelens`.

Health checks (kube-probe, GoogleHC, ELB-HealthChecker, and Google uptime checks), CORS preflights, and files served as
they are (images, fonts, scripts, style sheets from `express.static` or any handler with no route) are not traced, so
they never bury real visits. A missing file (404) and an HTML page are still traced. `traceStaticFiles: true` or
`WIZELENS_STATIC_FILES=true` traces every file.

**NestJS.** `instrumentNest` adds the request capture for Express or Fastify, a global interceptor, and a hook on Nest's
exception handlers. Requests are named by their route template with the global prefix and version (`GET /api/v1/orders/:id`)
and carry `nest.controller`, `nest.handler`, and `nest.version`. Exceptions Nest's filters answer (from guards, pipes,
handlers, or middleware) are recorded on the request. Already mounted the middleware? Pass `{ capture: false }`.

## The HUD on your pages

In development, every full HTML page your app answers gets [the HUD](/docs/hud/), on every framework above but Next.js.
There is no code to add: the add-on serves the browser script at `/_wizelens/wizelens.js`, from `@wizeworks/lens-browser`,
which installs with it, and puts its tag before the page's last `</body>`. The page then traces its own calls too.

Page loads reach your app without `Accept-Encoding`, so `compression()`, `@fastify/compress`, `koa-compress`, and
`hono/compress` send them plain and the tag fits. Turn it off with `hud: false` or `WIZELENS_HUD=false`. Next.js pages
show it with [`WizeLensProvider`](/docs/react/).

## GraphQL

```ts
import * as graphql from "graphql";
import { instrumentGraphql } from "@wizeworks/lens-node";

instrumentGraphql(wizelens, graphql); // before you create the server
```

Works with graphql-js 16 and up: Apollo Server, Mercurius, NestJS GraphQL, and GraphQL Yoga
(`instrumentGraphql(wizelens, require("@graphql-tools/executor"))`). Each operation gets a span named like `query GetOrders`,
with `graphql.operation.type`, `graphql.operation.name`, and `graphql.document` (literal values replaced by `*`; variable values
are never stored). Errors in the result are recorded on the span. The request is named by its operation,
`POST /graphql (GetOrders)`, so each operation is its own endpoint. Options: `resolvers` (`"slow"` by default: a span only for
resolvers at or over `slowResolverMs`, 50 ms; `"all"`; `"none"`) and `document` (`true`). graphql 17 and later announce each operation on Node's tracing channels, so any app works, ES module or CommonJS, with or
without the auto install. For graphql 16 in an ES module app, or with Mercurius, use the [auto install](/docs/auto-install/),
which hooks graphql as it loads. WebSocket subscriptions are not traced.

## Databases

| Library | Code |
|---|---|
| `pg` | `instrumentPg(wizelens, pg)` |
| postgres.js (`postgres`) | `instrumentPostgresJs(wizelens, sql)` |
| `mysql2` | `instrumentMysql2(wizelens, mysql)` |
| `better-sqlite3` | `instrumentBetterSqlite3(wizelens, db)` |
| `node:sqlite` | `instrumentNodeSqlite(wizelens, db)` |
| Prisma | `const prisma = new PrismaClient().$extends(prismaExtension(wizelens, { system: "postgresql" }))` |
| TypeORM | `instrumentTypeOrm(wizelens, dataSource)` |
| Drizzle | `instrumentDrizzle(wizelens, db)` (on `pg`, postgres.js, `mysql2`, `better-sqlite3`, or `node:sqlite`) |
| `ioredis` | `instrumentIoRedis(wizelens, Redis)` (Redis, Cluster, pipelines, MULTI) |
| `redis` (node-redis v4+) | `instrumentRedis(wizelens, redis)` |
| `mongodb` | `instrumentMongoDb(wizelens, mongodb)` (or a MongoClient, Db, or collection) |
| `@elastic/elasticsearch` | `instrumentElasticsearch(wizelens, elastic)` (v8; v7 works too) |
| Anything else | `wizelens.traceDb({ system: "postgresql" }, sql, params, () => run(sql, params))` |

An ORM and the driver under it never count the same query twice. Queries outside a request (startup, jobs) are skipped
unless you set `traceQueriesOutsideRequests: true`.

Redis, MongoDB, and Elasticsearch calls show on the Database and Query pages and in the N+1 and duplicate insights, as
`GET user:?`, `find orders {"status":?}`, or `POST /orders/_search`. Values are never stored: no Redis values or passwords, no
Mongo filter values or documents, no Elasticsearch bodies. Ids in keys and paths become `?`, so `GET user:1` and `GET user:2`
group as one query. To find repeats with the same values, each call carries a salted fingerprint of its values that only
compares calls inside one process. A pipeline or MULTI is one span with its command count. The auto install hooks all four;
`WIZELENS_AUTO_SKIP=ioredis,redis,mongodb,elasticsearch` leaves any of them off.

## gRPC and messaging

| Library | Code |
|---|---|
| `@grpc/grpc-js` | `instrumentGrpc(wizelens, grpc)` |
| `amqplib` (RabbitMQ) | `instrumentAmqplib(wizelens, amqplib)` |
| `kafkajs` | `instrumentKafkaJs(wizelens, kafka)` |
| `@azure/service-bus` | `instrumentServiceBus(wizelens, client)` |
| BullMQ | `instrumentBullMq(wizelens, bullmq)` |
| Amazon SQS (`@aws-sdk/client-sqs`) | `instrumentSqs(wizelens, sqs)`, then `processSqsMessage(wizelens, message, handle)` for each message |

**BullMQ.** `Queue.add`, `addBulk`, and `FlowProducer.add` record a `send <queue>` span and put the trace in each job's
`opts.telemetry.metadata` (the field BullMQ's own telemetry uses), so job data is never changed. Each job a `Worker` runs is a
`process <queue>` span in the same trace, with the job id, name, attempt, and any error. Time a job waits in the queue never
lengthens the request that added it. Delays, waiting for children, and rate limits are not failures.

**SQS.** `SendMessage` and `SendMessageBatch` record a `send <queue>` span and add `traceparent` and `tracestate` message
attributes while the message stays within SQS's limit of 10. `ReceiveMessage` asks for those attributes and records a
`receive <queue>` span. `processSqsMessage` runs your handler as a `process <queue>` span in the sender's trace; it also takes
a Lambda SQS record. Other commands show as outgoing HTTP calls. The auto install hooks both; skip them with
`WIZELENS_AUTO_SKIP=bullmq,sqs`.

## Logs

Lines written during a request go into its trace. Lines written outside one (startup, jobs, timers) are kept too, as
"Outside a request". The `logs` option (`{ outside, minLevel, sampleRate }`) or the `WIZELENS_LOGS_*` variables control how
many: on, `info` and up, and all of them by default. See [Logs](/docs/logs/). Your loggers still write where they wrote
before; WizeLens only copies the lines.

| Logger | How |
|---|---|
| `console.*` | Automatic. Turn it off with `captureConsole: false`. |
| Fastify (`request.log`, `app.log`) | Automatic with `wizeLensFastify`. |
| pino (also `nestjs-pino`) | `instrumentPino(wizelens, logger)` |
| winston | `instrumentWinston(wizelens, logger)` |
| bunyan | `instrumentBunyan(wizelens, logger)`, before you make child loggers |
| consola | `instrumentConsola(wizelens, consola)` |
| log4js | `appenders: { wizelens: { type: log4jsAppender(wizelens) } }`, and list it in your categories |
| NestJS built-in logger | `NestFactory.create(AppModule, { logger: nestLogger(wizelens, new ConsoleLogger()) })` |
| OpenTelemetry logs | `new LoggerProvider({ processors: [wizeLensLogProcessor(wizelens)] })` |
| Anything else | `wizelens.logger.info("message", { key: "value" })` |

`wizelens.logger` has `trace`, `debug`, `info`, `warn`, `error`, and `critical`, and `logger.child("billing")` gives a logger
with its own category. `wizelens.recordException(err)` records an error you caught on the active span.

## Metrics

Every 10 seconds the add-on samples CPU, memory, the V8 heap, event loop delay, and GC pauses. To keep your own
OpenTelemetry metrics too, add the WizeLens exporter:

```ts
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { wizeLensMetricExporter } from "@wizeworks/lens-node";

const provider = new MeterProvider({
  readers: [new PeriodicExportingMetricReader({ exporter: wizeLensMetricExporter(wizelens) })],
});
```

Metrics are kept in memory for 1 hour (`metricsMaxAgeMs`). `captureMetrics: false` turns them off.

## Tags and users

```ts
wizelens.tag("cache", "hit");
wizelens.setUser(user.id, { name: user.name });
wizelens.expected(); // this answer is on purpose, such as a 503 "come back later"
```

`expected()` keeps a 5xx you meant out of error rates; the header `X-WizeLens-Expected: 1` does the same. See
[Answers you expect](/docs/dashboard/#answers-you-expect).

`setUser` puts `enduser.id` on the request, and the name as `user.full_name`. The Users page shows the name, with the id
under it. Leave the name out to keep only the id, or add `user.full_name` to the project's Redacted keys to drop names
on the server. When only the browser names the user, its spans name the request's user too.

## Known vulnerabilities

With a hub or WizeLens Cloud set, the add-on sends the names and versions of your installed packages once at start. The
hub and the cloud check them against OSV and show each vulnerable version on the [Security](/docs/security/#known-vulnerable-packages) page, with its advisories, CVEs,
and the version that fixes it. Only names and versions leave your machine. `reportPackages: false` or
`WIZELENS_PACKAGES=false` turns it off.

The full option list is on [Configuration](/docs/configuration/#node).
