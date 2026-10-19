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
| Fastify | `await app.register(wizelensFastify(wizelens))` |
| Koa | `app.use(wizelensKoa(wizelens))` first |
| Hono (Node) | `app.use(wizelensHono(wizelens))` first |
| Plain `node:http` | `if (await wizelens.handler(req, res)) return;` for the dashboard, and `traceDb()` for queries |
| Next.js | `instrumentation.ts`, see [Next.js](/docs/nextjs/) |

Outgoing `fetch` calls (and undici) and Express routing time are traced by themselves. Open `http://localhost:<port>/_wizelens`.

## Databases

| Library | Code |
|---|---|
| `pg` | `instrumentPg(wizelens, pg)` |
| `mysql2` | `instrumentMysql2(wizelens, mysql)` |
| `better-sqlite3` | `instrumentBetterSqlite3(wizelens, db)` |
| `node:sqlite` | `instrumentNodeSqlite(wizelens, db)` |
| Prisma | `const prisma = new PrismaClient().$extends(prismaExtension(wizelens, { system: "postgresql" }))` |
| TypeORM | `instrumentTypeOrm(wizelens, dataSource)` |
| Drizzle | `instrumentDrizzle(wizelens, db)` (on `pg`, `mysql2`, `better-sqlite3`, or `node:sqlite`) |
| Anything else | `wizelens.traceDb({ system: "postgresql" }, sql, params, () => run(sql, params))` |

An ORM and the driver under it never count the same query twice. Queries outside a request (startup, jobs) are skipped
unless you set `traceQueriesOutsideRequests: true`.

## gRPC and messaging

| Library | Code |
|---|---|
| `@grpc/grpc-js` | `instrumentGrpc(wizelens, grpc)` |
| `amqplib` (RabbitMQ) | `instrumentAmqplib(wizelens, amqplib)` |
| `kafkajs` | `instrumentKafkaJs(wizelens, kafka)` |
| `@azure/service-bus` | `instrumentServiceBus(wizelens, client)` |

## Logs

Lines written during a request go into its trace. Lines written outside a request are skipped. Your loggers still write
where they wrote before; WizeLens only copies the lines.

| Logger | How |
|---|---|
| `console.*` | Automatic. Turn it off with `captureConsole: false`. |
| Fastify (`request.log`, `app.log`) | Automatic with `wizelensFastify`. |
| pino (also `nestjs-pino`) | `instrumentPino(wizelens, logger)` |
| winston | `instrumentWinston(wizelens, logger)` |
| bunyan | `instrumentBunyan(wizelens, logger)`, before you make child loggers |
| consola | `instrumentConsola(wizelens, consola)` |
| log4js | `appenders: { wizelens: { type: log4jsAppender(wizelens) } }`, and list it in your categories |
| NestJS built-in logger | `NestFactory.create(AppModule, { logger: nestLogger(wizelens, new ConsoleLogger()) })` |
| OpenTelemetry logs | `new LoggerProvider({ processors: [wizelensLogProcessor(wizelens)] })` |
| Anything else | `wizelens.logger.info("message", { key: "value" })` |

## Metrics

Every 10 seconds the add-on samples CPU, memory, the V8 heap, event loop delay, and GC pauses. To keep your own
OpenTelemetry metrics too, add the WizeLens exporter:

```ts
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { wizelensMetricExporter } from "@wizeworks/lens-node";

const provider = new MeterProvider({
  readers: [new PeriodicExportingMetricReader({ exporter: wizelensMetricExporter(wizelens) })],
});
```

Metrics are kept in memory for 1 hour (`metricsMaxAgeMs`). `captureMetrics: false` turns them off.

## Tags and users

```ts
wizelens.tag("cache", "hit");
wizelens.setUser(user.id);
```

The full option list is on [Configuration](/docs/configuration/#node).
