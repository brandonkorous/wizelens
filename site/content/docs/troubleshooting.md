---
title: Troubleshooting
description: What to check when a request, query, log line, or service does not show up.
---

| You see | Check |
|---|---|
| No requests at all | WizeLens is mounted first (Express, Koa, Hono), and the app runs in development or has `WIZELENS_ENABLED=true` (and `WIZELENS_DASHBOARD=true` to read it there). |
| Requests but no queries | The database line runs before the first query. |
| Requests but no logs | Lines outside a request need `Logs.Outside` / `logs.outside` on (the default) and a level at or above `Logs.MinLevel` / `logs.minLevel` (default info). Serilog and NLog apps need `WizeLens.Serilog` or `WizeLens.NLog`. Node loggers other than `console` and Fastify need their one line. |
| No browser timing | `import "@wizeworks/lens-react/install"` is the first import, and `/_wizelens` reaches your API. |
| No HUD on a page your server renders | The add-on serves the dashboard (development, or `WIZELENS_DASHBOARD=true`), `Hud` / `hud` and `WIZELENS_HUD` are not `false`, and the page is a full `200` `text/html` answer with a `</body>`. A page your app compresses itself is left alone. Node: the log says when `@wizeworks/lens-browser` is missing. See [The HUD](/docs/hud/). |
| No HUD in Vue, Angular, Svelte, or plain JS | With `hud: "auto"` (the default) it shows only when `{endpoint}/api/info` answers. Open that address: it must reach the server's dashboard, not your app's HTML fallback. Or pass `hud: true`. |
| A downstream service is missing | It runs WizeLens too, and the call goes through `HttpClient`, `fetch`, or gRPC. |
| A service is missing in the hub | `WIZELENS_HUB` is set where the service runs, and the service was restarted. The service log says why the hub took nothing: it could not be reached, it needs a key or refused one (`401`, `403`: set `WIZELENS_HUB_TOKEN` to a live `wl_ik_` key), or it asked to slow down (`429`). |
| An OpenTelemetry app shows "Idle" | Normal: OpenTelemetry apps send only when they have data. |
| Next.js routes all 404 after an update | Stop `next dev`, delete `.next`, and start it again. |
| Fewer requests than you sent | Sampling is on. See the **Settings** page and `WIZELENS_SAMPLE_RATE`. |
| Old data is gone after a restart | Traces are kept for 24 hours or 2,000 traces. Change `MaxAge` / `maxAgeMs` and `MaxTraces` / `maxTraces`. |
| No CORS preflight requests | By design: `OPTIONS` preflights carry no `traceparent`, so they are not traced. |
| A 404 or 400 does not count as an error | By design: a 4xx answer is not a failure. See [What counts as an error](/docs/dashboard/#what-counts-as-an-error). |
| A 503 you send on purpose counts as an error | Send `X-WizeLens-Expected: 1` on it, or call `wizelens.expected()` (Node) or `WizeLensRequest.Expected()` (.NET). See [Answers you expect](/docs/dashboard/#answers-you-expect). |
| No health check requests | By design: Kubernetes probes and Google and AWS health checks are not traced. Other requests to the same path are. |

## The SQLite file

Each app keeps its traces at `.wizelens/traces.db`. If the file cannot be written, WizeLens logs one warning and keeps
working in memory. It never breaks your app.

## Still stuck

Open an issue on [GitHub](https://github.com/brandonkorous/wizelens/issues) with your stack, versions, and what you expected to see.
