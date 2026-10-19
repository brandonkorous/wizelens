---
title: Configuration
description: Every option for the .NET and Node add-ons and the React provider, with its default.
---

## ASP.NET Core

Pass options to `builder.Services.AddWizeLens(o => { ... })`.

| Option | Default | Description |
|---|---|---|
| `Enabled` | `WIZELENS_ENABLED`, else Development only | Turn WizeLens on or off. |
| `Dashboard` | `WIZELENS_DASHBOARD`, else Development only | Serve the dashboard, read API, and MCP. `false` is send-only. See [Production](/docs/production/). |
| `BasePath` | `/_wizelens` | Where the dashboard and API live. |
| `ServiceName` | app name | Name shown for this service. |
| `Storage` | `Sqlite`, or `Memory` when send-only | `Sqlite` (survives restarts) or `Memory`. |
| `StoragePath` | `.wizelens/traces.db` | SQLite file, relative to the content root. |
| `MaxTraces` | `2000` | Traces kept in memory and on disk. |
| `MaxAge` | `24h` | Traces older than this are dropped. |
| `EnableMcp` | `false` | Expose the read-only MCP endpoint at `{BasePath}/mcp`. |
| `RedactKeys` | see [Redaction](#redaction) | Key fragments whose values are redacted. |
| `NPlusOneThreshold` | `5` | Repeats in one trace that count as N+1. |
| `SlowQueryMs` | `100` | Queries at or above this are slow. |
| `CaptureResponseBody` | `false` | Keep the first 16 KB of text and JSON responses. |
| `HubUrl` / `HubToken` | `WIZELENS_HUB` / `WIZELENS_HUB_TOKEN` | Also send everything to a hub or the cloud. |
| `Project` | `WIZELENS_PROJECT` | Groups this service with others on a shared hub. |
| `Sampling.Rate` | `WIZELENS_SAMPLE_RATE`, else `1` | Share of traces kept (0 to 1). |
| `Sampling.KeepErrors` | `true` | Keep every trace with an error. |
| `Sampling.KeepSlowMs` | `1000` | Keep every trace with a server-side span this long (`null` turns it off). |
| `Logs.Outside` | `WIZELENS_LOGS_OUTSIDE`, else `true` | Keep log lines written outside a request (startup, jobs, timers). See [Logs](/docs/logs/). |
| `Logs.MinLevel` | `WIZELENS_LOGS_MIN_LEVEL`, else `Information` | Lowest level kept for lines outside a request. |
| `Logs.SampleRate` | `WIZELENS_LOGS_SAMPLE_RATE`, else `1` | Share of lines outside a request below `Warning` that are kept (0 to 1). |
| `CaptureMetrics` | `true` | Read every `Meter` in the app. |
| `MetricsInterval` / `MetricsMaxAge` | 10 s / 1 h | How often metrics are taken, and how long they are kept in memory. |

## Node

Pass options to `createWizeLens({ ... })`, or to `registerWizeLens({ ... })` on Next.js.

| Option | Default | Description |
|---|---|---|
| `serviceName` | *(required)* | Name shown for this service. |
| `enabled` | `WIZELENS_ENABLED`, else on unless `NODE_ENV=production` | Turn WizeLens on or off. |
| `dashboard` | `WIZELENS_DASHBOARD`, else on unless `NODE_ENV=production` | Serve the dashboard, read API, and MCP. `false` is send-only. See [Production](/docs/production/). |
| `basePath` | `/_wizelens` | Where the dashboard and API live. |
| `storage` | `"sqlite"`, or `"memory"` when send-only | `"sqlite"` or `"memory"`. |
| `storagePath` | `{cwd}/.wizelens/traces.db` | SQLite file. |
| `maxTraces` / `maxAgeMs` | `2000` / 24 h | How much is kept. |
| `enableMcp` | `false` | Expose the read-only MCP endpoint. |
| `redactKeys` | see [Redaction](#redaction) | Key fragments whose values are redacted. |
| `instrumentFetch` | `true` | Trace outgoing `fetch` and undici calls. |
| `captureConsole` | `true` | Copy `console.*` lines into the trace, or outside a request as loose lines. |
| `traceQueriesOutsideRequests` | `false` | Database adapters also trace queries outside a request. |
| `publicEndpoint` | auto | Override `X-WizeLens-Endpoint`, for example behind a proxy. |
| `audit` | `console.info` | Where MCP audit lines go. |
| `slowQueryMs` / `nPlusOneThreshold` | `100` / `5` | Insight thresholds. |
| `captureResponseBody` | `false` | Keep the first 16 KB of text and JSON responses. |
| `hub` / `hubToken` | `WIZELENS_HUB` / `WIZELENS_HUB_TOKEN` | Also send everything to a hub or the cloud. |
| `project` | `WIZELENS_PROJECT` | Groups this service with others on a shared hub. |
| `sampling` | `{ rate: WIZELENS_SAMPLE_RATE ?? 1, keepErrors: true, keepSlowMs: 1000 }` | See [Sampling](/docs/sampling/). |
| `logs` | `{ outside: true, minLevel: "info", sampleRate: 1 }`, or the `WIZELENS_LOGS_*` variables | Log lines written outside a request. See [Logs](/docs/logs/). |
| `captureMetrics` | `true` | Sample the runtime every `metricsIntervalMs`. |
| `metricsIntervalMs` / `metricsMaxAgeMs` | 10 s / 1 h | How often metrics are taken, and how long they are kept in memory. |
| `ignore(path)` | none | Next.js only: paths to skip. |

## React

Props on `WizeLensProvider`.

| Prop | Default | Description |
|---|---|---|
| `endpoint` | `/_wizelens` | WizeLens base path or URL on your API. |
| `enabled` | `true` | Pass `import.meta.env.DEV` (or similar). |
| `hud` | `true` | Show the in-page HUD. `false` also stops reading traces back, for a send-only server. |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `slowMs` | `500` | Requests at or over this many ms show as "warning". |
| `capturePages` | `true` | Send page views, React render stats, and browser errors. |
| `captureConsole` | `true` | Copy browser `console` calls into the page view's trace (at most 500 per page). |

## Environment variables

| Variable | Used by | Means |
|---|---|---|
| `WIZELENS_ENABLED` | .NET, Node | Turn WizeLens on (`true`) or off (`false`). |
| `WIZELENS_DASHBOARD` | .NET, Node | Serve the dashboard, read API, and MCP (`true`), or send only (`false`). |
| `WIZELENS_HUB` | .NET, Node | Send to this hub or cloud. |
| `WIZELENS_HUB_TOKEN` | .NET, Node | The hub token, or a cloud ingest key. |
| `WIZELENS_PROJECT` | .NET, Node | Project name on a shared hub. |
| `WIZELENS_SAMPLE_RATE` | .NET, Node | Sampling rate, 0 to 1. |
| `WIZELENS_LOGS_OUTSIDE` | .NET, Node | Keep log lines outside a request (`true`/`false`). |
| `WIZELENS_LOGS_MIN_LEVEL` | .NET, Node | Lowest level kept outside a request: `trace`, `debug`, `info`, `warn`, `error`, `critical`. |
| `WIZELENS_LOGS_SAMPLE_RATE` | .NET, Node | Share of lines outside a request below warn that are kept, 0 to 1. |

## Redaction

Before anything is stored, a value is replaced with `[redacted]` when its key contains any of: `authorization`, `cookie`,
`password`, `passwd`, `secret`, `token`, `apikey`, `api_key`, or `connectionstring` (any case). This covers attributes,
database parameter names, and headers. Change the list with `RedactKeys` / `redactKeys`.
