---
title: Troubleshooting
description: What to check when a request, query, log line, or service does not show up.
---

Find what you see, then do the steps in order. Stop at the first one that fixes it.

## Nothing shows up

### No requests at all

1. Check that WizeLens is mounted before your routes (Express, Koa, Hono).
2. Check that the app runs in development, or has `WIZELENS_ENABLED=true`.
3. To read the dashboard in that app outside development, also set `WIZELENS_DASHBOARD=true`.

### No HUD on a page your server renders

1. Check that the add-on serves the dashboard: development, or `WIZELENS_DASHBOARD=true`.
2. Check that `Hud` / `hud` and `WIZELENS_HUD` are not `false`.
3. Check that the page is a full `200` `text/html` answer with a `</body>`. A page your app compresses itself is left
   alone.
4. Node: read the app's log. It says when `@wizeworks/lens-browser` is missing.

See [The HUD](/docs/hud/).

### No HUD in Vue, Angular, Svelte, or plain JS

1. With `hud: "auto"` (the default), the HUD shows only when `{endpoint}/api/info` answers. Open that address.
2. It must reach the server's dashboard, not your app's HTML fallback. Fix the endpoint or the proxy if it does not.
3. Or pass `hud: true` to show it always.

### Next.js routes all answer 404 after an update

1. Stop `next dev`.
2. Delete the `.next` folder.
3. Start `next dev` again.

See [Update WizeLens](/docs/nextjs/#update-wizelens).

## Something is missing

### Requests, but no queries

1. Check that the database line runs before the first query.

### Requests, but no logs

1. Lines outside a request need `Logs.Outside` / `logs.outside` on. It is on by default.
2. Check the level: a line must be at or above `Logs.MinLevel` / `logs.minLevel` (default `info`).
3. Serilog and NLog apps need `WizeLens.Serilog` or `WizeLens.NLog`.
4. Node loggers other than `console` and Fastify need their one line.

### No browser timing

1. Check that `import "@wizeworks/lens-react/install"` is the first import.
2. Check that `/_wizelens` reaches your API.

### A downstream service is missing

1. Check that the downstream service runs WizeLens too.
2. Check that the call goes through `HttpClient`, `fetch`, or gRPC.

### A service is missing in the hub

1. Check that `WIZELENS_ENDPOINT` is set where the service runs.
2. Restart the service after you set it.
3. Read the service's log. It says why the hub took nothing:
   - it could not reach the hub;
   - the hub needs a key, or refused one (`401`, `403`): set `WIZELENS_TOKEN` to a live `wl_ik_` key;
   - the hub asked it to slow down (`429`).

### Fewer requests than you sent

1. Sampling is on. Open **Connect → This service** to see the rate.
2. Change `WIZELENS_SAMPLE_RATE` to keep more.

### Old data is gone after a restart

1. Traces are kept for 24 hours or 2,000 traces.
2. Change `MaxAge` / `maxAgeMs` and `MaxTraces` / `maxTraces` to keep more.

## Working as designed

These look like faults, but they are on purpose.

| You see | Why |
|---|---|
| An OpenTelemetry app shows "Idle" | OpenTelemetry apps send only when they have data. |
| No CORS preflight requests | `OPTIONS` preflights carry no `traceparent`, so they are not traced. |
| A 404 or 400 does not count as an error | A 4xx answer is not a failure. See [What counts as an error](/docs/dashboard/#what-counts-as-an-error). |
| No health check requests | Kubernetes probes and Google and AWS health checks are not traced. Other requests to the same path are. |

A `503` you send on purpose counts as an error. To mark it as expected, send `X-WizeLens-Expected: 1` on it, or call
`wizelens.expected()` (Node) or `WizeLensRequest.Expected()` (.NET). See [Answers you expect](/docs/dashboard/#answers-you-expect).

## The SQLite file

Each app keeps its traces at `.wizelens/traces.db`. If the file cannot be written, WizeLens logs one warning and keeps
working in memory. It never breaks your app.

## Still stuck

Open an issue on [GitHub](https://github.com/wizeworksllc/wizelens/issues) with your stack, versions, and what you expected to see.
