---
title: Troubleshooting
description: What to check when a request, query, log line, or service does not show up.
---

| You see | Check |
|---|---|
| No requests at all | WizeLens is mounted first (Express, Koa, Hono), and the app runs in development. |
| Requests but no queries | The database line runs before the first query. |
| Requests but no logs | Only lines written during a request are kept. Serilog and NLog apps need `WizeLens.Serilog` or `WizeLens.NLog`. Node loggers other than `console` and Fastify need their one line. |
| No browser timing | `import "@wizeworks/lens-react/install"` is the first import, and `/_wizelens` reaches your API. |
| A downstream service is missing | It runs WizeLens too, and the call goes through `HttpClient`, `fetch`, or gRPC. |
| A service is missing in the hub | `WIZELENS_HUB` is set where the service runs, and the service was restarted. The service log says when it cannot reach the hub. |
| An OpenTelemetry app shows "Idle" | Normal: OpenTelemetry apps send only when they have data. |
| Next.js routes all 404 after an update | Stop `next dev`, delete `.next`, and start it again. |
| Fewer requests than you sent | Sampling is on. See the **Settings** page and `WIZELENS_SAMPLE_RATE`. |
| Old data is gone after a restart | Traces are kept for 24 hours or 2,000 traces. Change `MaxAge` / `maxAgeMs` and `MaxTraces` / `maxTraces`. |
| No CORS preflight requests | By design: `OPTIONS` preflights carry no `traceparent`, so they are not traced. |
| No health check requests | By design: Kubernetes probes and Google and AWS health checks are not traced. Other requests to the same path are. |

## The SQLite file

Each app keeps its traces at `.wizelens/traces.db`. If the file cannot be written, WizeLens logs one warning and keeps
working in memory. It never breaks your app.

## Still stuck

Open an issue on [GitHub](https://github.com/brandonkorous/wizelens/issues) with your stack, versions, and what you expected to see.
