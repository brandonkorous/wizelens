# @wizeworks/lens-node

The Node add-on of [WizeLens](https://github.com/brandonkorous/wizelens): one trace per request with every database call, outgoing call, message, log, and error, and a dashboard at `/_wizelens`.

```ts
import express from "express";
import pg from "pg";
import { createWizeLens, instrumentPg } from "@wizeworks/lens-node";

const wizelens = createWizeLens({ serviceName: "orders-api" });
instrumentPg(wizelens, pg);

const app = express();
app.use(wizelens.middleware);      // first
// ...your routes...
app.use(wizelens.errorMiddleware); // last
```

- **Frameworks:** Express (`wizelens.middleware`), Fastify (`wizelensFastify`), Koa (`wizelensKoa`), Hono (`wizelensHono`), or plain `node:http` (`wizelens.handler`).
- **Databases:** `instrumentPg`, `instrumentMysql2`, `instrumentBetterSqlite3`, `instrumentNodeSqlite`, `prismaExtension`, `instrumentTypeOrm`, `instrumentDrizzle`, or `wizelens.traceDb` for anything else.
- **gRPC and messaging:** `instrumentGrpc`, `instrumentAmqplib`, `instrumentKafkaJs`, `instrumentServiceBus`.
- **Outgoing `fetch`** is traced automatically. Tag requests with `wizelens.tag(key, value)` and name the user with `wizelens.setUser(id)`.

## The HUD on your pages

While the dashboard is served, the add-on puts the WizeLens HUD on the HTML pages your app answers, with no code in the page.
It serves the `@wizeworks/lens-browser` script at `/_wizelens/wizelens.js` (and its map) and adds this tag right before the
last `</body>`:

```html
<script src="/_wizelens/wizelens.js" data-endpoint="/_wizelens" data-hud="true" data-source="inject" defer></script>
```

Only a `GET` answered `200` with `Content-Type: text/html` and no `Content-Encoding` gets it, outside `/_wizelens`, and only
when the body has a `</body>` (fragments, such as htmx partials, are left alone). The body streams through, and an answer that
gets the tag loses a `Content-Length` it can no longer keep. It works the same for Express, Fastify, Koa, Hono, NestJS, Next.js,
and plain `node:http`. A page that starts WizeLens itself takes over from the injected script. Turn it off with `hud: false` or
`WIZELENS_HUD=false`.

So that a compressing layer (`compression()`, `@fastify/compress`, `koa-compress`, `hono/compress`, Next.js) answers a page in
plain HTML that can take the tag, a page navigation (a `GET` whose `Accept` has `text/html`) reaches your app without its
`Accept-Encoding` header while the HUD is on. Scripts, JSON, and other files are still compressed. This only happens while the
dashboard is served, which is development by default.

## Logs

Log lines written during a request go into its trace. Lines written outside a request (startup, timers) are skipped.

| Logger | How |
|---|---|
| `console.*` | Automatic. Turn it off with `captureConsole: false`. |
| Fastify (`request.log`, `app.log`) | Automatic with `wizelensFastify`. |
| pino (also NestJS with `nestjs-pino`) | `instrumentPino(wizelens, logger)`. Covers every logger from the same pino copy. |
| winston | `instrumentWinston(wizelens, logger)`. Child loggers are covered. |
| bunyan | `instrumentBunyan(wizelens, logger)`. Call it before you make child loggers. |
| consola | `instrumentConsola(wizelens, consola)` |
| log4js | Add an appender: `appenders: { wizelens: { type: log4jsAppender(wizelens) } }`, and list it in your categories. |
| NestJS built-in logger | `NestFactory.create(AppModule, { logger: nestLogger(wizelens, new ConsoleLogger()) })` |
| OpenTelemetry logs | `new LoggerProvider({ processors: [wizelensLogProcessor(wizelens)] })` |
| Anything else | `wizelens.logger.info("message", { key: "value" })` |

Your loggers still write where they wrote before. WizeLens only copies the lines. Fields become log attributes, sensitive names are
redacted, and errors keep their type, message, and stack. Fastify's own "incoming request" and "request completed" lines are skipped,
because the trace already shows them. When WizeLens reads pino, winston, or bunyan directly, the OpenTelemetry bridge records of the
same logger are skipped, so no line shows twice.

## Metrics

Every 10 seconds the add-on samples its runtime: CPU (`process.cpu.utilization`, `process.cpu.time`), memory (`process.memory.usage`),
the V8 heap, event loop delay and use, and GC pauses (`v8js.gc.duration`). The names follow OpenTelemetry. They show on the
**Metrics** page, at `api/metrics/points?since=<epoch ms>`, and in the MCP tools `list_metrics` and `get_metric`.

To keep your own OpenTelemetry metrics too, add the WizeLens exporter to your meter provider:

```ts
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { wizelensMetricExporter } from "@wizeworks/lens-node";

const provider = new MeterProvider({ readers: [new PeriodicExportingMetricReader({ exporter: wizelensMetricExporter(wizelens) })] });
```

Metrics are kept in memory for 1 hour (`metricsMaxAgeMs`), at most 50,000 points and 1,000 series. With a hub set, they are sent
to the hub as well. `metricsIntervalMs` changes the sample rate; `captureMetrics: false` turns metrics off.

On by default in development only. See the [getting-started guide](https://github.com/brandonkorous/wizelens/blob/main/docs/GETTING-STARTED.md) and the full option list in the [README](https://github.com/brandonkorous/wizelens#configuration).

MIT licensed.
