---
title: Configuration
description: Every option for the .NET and Node add-ons, the React provider, the browser packages, and the command line, and every environment variable, with its default.
---

## ASP.NET Core

Pass options to `builder.Services.AddWizeLens(o => { ... })`.

| Option | Default | Description |
|---|---|---|
| `Enabled` | `WIZELENS_ENABLED`, else Development only | Turn WizeLens on or off. |
| `Dashboard` | `WIZELENS_DASHBOARD`, else Development only | Serve the dashboard, read API, and MCP. `false` is send-only. See [Production](/docs/production/). |
| `Hud` | `WIZELENS_HUD`, else `true` | While the dashboard is served, put [the HUD](/docs/hud/) on the app's HTML pages, with its script at `{BasePath}/wizelens.js`. |
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
| `ReportPackages` | `true`, or `false` when `WIZELENS_PACKAGES=false` | With a hub or the cloud set, send the app's NuGet package names and versions once at start, for the known-vulnerability check on the [Security](/docs/security/#known-vulnerable-packages) page. |
| `HubUrl` / `HubToken` | `WIZELENS_HUB` / `WIZELENS_HUB_TOKEN` | Also send everything to a hub or the cloud. |
| `Project` | `WIZELENS_PROJECT` | Groups this service with others on a shared hub. |
| `Release` | `WIZELENS_RELEASE`, else `OTEL_SERVICE_VERSION`, else the entry assembly's informational version | The app's version, kept on every span (`service.version`) for release markers, version compares, and [Problems](/docs/problems/). |
| `Sampling.Rate` | `WIZELENS_SAMPLE_RATE`, else `1` | Share of traces kept (0 to 1). |
| `Sampling.KeepErrors` | `true` | Keep every trace with an error. |
| `Sampling.KeepSlowMs` | `1000` | Keep every trace with a server-side span this long (`null` turns it off). |
| `Logs.Outside` | `WIZELENS_LOGS_OUTSIDE`, else `true` | Keep log lines written outside a request (startup, jobs, timers). See [Logs](/docs/logs/). |
| `Logs.MinLevel` | `WIZELENS_LOGS_MIN_LEVEL`, else `Information` | Lowest level kept for lines outside a request. |
| `Logs.SampleRate` | `WIZELENS_LOGS_SAMPLE_RATE`, else `1` | Share of lines outside a request below `Warning` that are kept (0 to 1). |
| `CaptureMetrics` | `true` | Read every `Meter` in the app. |
| `MetricsInterval` / `MetricsMaxAge` | 10 s / 1 h | How often metrics are taken, and how long they are kept in memory. |
| `Tags.Rules` / `Tags.DisableBuiltIns` | none / none | Tag rules for the dashboard, such as `new("checkout", "route:/checkout*", "green")`, and built-in tags to turn off. A bad rule throws at start. See [Tags](/docs/tags/). |

`app.UseWizeLens()` adds the middleware and maps the dashboard. An app that is not a `WebApplication` also calls
`endpoints.MapWizeLens()` inside `UseEndpoints`.

## Node

Pass options to `createWizeLens({ ... })`, or to `registerWizeLens({ ... })` on Next.js.

| Option | Default | Description |
|---|---|---|
| `serviceName` | *(required)* | Name shown for this service. |
| `enabled` | `WIZELENS_ENABLED`, else on unless `NODE_ENV=production` | Turn WizeLens on or off. |
| `dashboard` | `WIZELENS_DASHBOARD`, else on unless `NODE_ENV=production` | Serve the dashboard, read API, and MCP. `false` is send-only. See [Production](/docs/production/). |
| `hud` | `WIZELENS_HUD`, else `true` | While the dashboard is served, put [the HUD](/docs/hud/) on the app's HTML pages, with its script at `{basePath}/wizelens.js`. Next.js pages use `WizeLensProvider`. |
| `basePath` | `/_wizelens` | Where the dashboard and API live. |
| `storage` | `"sqlite"`, or `"memory"` when send-only | `"sqlite"` or `"memory"`. |
| `storagePath` | `{cwd}/.wizelens/traces.db` | SQLite file. |
| `maxTraces` / `maxAgeMs` | `2000` / 24 h | How much is kept. |
| `enableMcp` | `false` | Expose the read-only MCP endpoint. |
| `redactKeys` | see [Redaction](#redaction) | Key fragments whose values are redacted. |
| `tags` | none | `{ rules: [{ name, query, color? }], disableBuiltIns: ["bot"] }`: tag rules for the dashboard, and built-in tags to turn off. A bad rule throws at start. See [Tags](/docs/tags/). |
| `instrumentFetch` | `true` | Trace outgoing `fetch` and undici calls. |
| `instrumentHttp` | `true` | Trace outgoing `node:http` and `node:https` calls (axios, got, node-fetch v2, AWS SDK). |
| `captureConsole` | `true` | Copy `console.*` lines into the trace, or outside a request as loose lines. |
| `traceQueriesOutsideRequests` | `false` | Database adapters also trace queries outside a request. |
| `publicEndpoint` | auto | Override `X-WizeLens-Endpoint`, for example behind a proxy. |
| `audit` | `console.info` | Where MCP audit lines go. |
| `slowQueryMs` / `nPlusOneThreshold` | `100` / `5` | Insight thresholds. |
| `captureResponseBody` | `false` | Keep the first 16 KB of text and JSON responses. |
| `reportPackages` | `true` | With a hub or the cloud set, send the installed package names and versions once at start, for the known-vulnerability check on the [Security](/docs/security/#known-vulnerable-packages) page. `WIZELENS_PACKAGES=false` also turns it off. |
| `logToConsole` | `false` | Lines you write with `wizelens.logger` also go to the console. |
| `uiDir` | the dashboard build in the package | Serve the dashboard from another folder. |
| `hub` / `hubToken` | `WIZELENS_HUB` / `WIZELENS_HUB_TOKEN` | Also send everything to a hub or the cloud. |
| `project` | `WIZELENS_PROJECT` | Groups this service with others on a shared hub. |
| `release` | `WIZELENS_RELEASE`, else `OTEL_SERVICE_VERSION`, else `npm_package_version` | The app's version, kept on every span (`service.version`) for release markers, version compares, and [Problems](/docs/problems/). |
| `sampling` | `{ rate: WIZELENS_SAMPLE_RATE ?? 1, keepErrors: true, keepSlowMs: 1000 }` | See [Sampling](/docs/sampling/). |
| `sourceMaps` | dev servers on `localhost` | `{ dirs, origins, fetch }`: where browser stacks find their maps; `false` turns it off. See [Source maps](/docs/source-maps/). |
| `logs` | `{ outside: true, minLevel: "info", sampleRate: 1 }`, or the `WIZELENS_LOGS_*` variables | Log lines written outside a request. See [Logs](/docs/logs/). |
| `captureMetrics` | `true` | Sample the runtime every `metricsIntervalMs`. |
| `metricsIntervalMs` / `metricsMaxAgeMs` | 10 s / 1 h | How often metrics are taken, and how long they are kept in memory. |
| `ignore(path)` | `nextIgnore` | Next.js only: paths to skip. It replaces the default, so call `nextIgnore(path)` in it too. See [Next.js](/docs/nextjs/). |

## React

Props on `WizeLensProvider`.

| Prop | Default | Description |
|---|---|---|
| `endpoint` | `/_wizelens` | WizeLens base path or URL on your API. |
| `enabled` | `true` | Pass `import.meta.env.DEV` (or similar). |
| `hud` | `true` | Show the in-page HUD. `false` also stops reading traces back, for a send-only server. |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `release` | from the build plugin | The web app's version, kept on browser spans for release markers and version compares, and so stacks find the right [source maps](/docs/source-maps/). |
| `slowMs` | `500` | Requests at or over this many ms show as "warning". |
| `capturePages` | `true` | Send page views, React render stats, and browser errors. |
| `captureConsole` | `true` | Copy browser `console` calls into the page view's trace (at most 500 per page). |
| `resolveFrames` | `true` | Read the page's own source maps (dev servers serve them) so errors group by your source. |
| `user` | none | The signed-in user, sent as `enduser.id` on every browser span. |
| `userName` | none | The signed-in user's display name, sent as `user.full_name` for the Users page. |

`<WizeLensUser id name />` sets the user from anywhere under the root. See [React](/docs/react/#the-signed-in-user).

## Browser

Options for `initWizeLens({ ... })` from `@wizeworks/lens-browser`, `@wizeworks/lens-angular`, and
`@wizeworks/lens-svelte`, and for `app.use(WizeLens, { ... })` from `@wizeworks/lens-vue`.

| Option | Default | Description |
|---|---|---|
| `endpoint` | `/_wizelens` | WizeLens base path or URL on your API. |
| `enabled` | `true` | Pass `import.meta.env.DEV` (or similar). Off returns an instance that does nothing. |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `release` | from the build plugin | The web app's version (`service.version`), for release markers and [source maps](/docs/source-maps/). `version` is the same option. |
| `user` / `userName` | none | The signed-in user (`enduser.id`) and display name (`user.full_name`). Change them later with `lens.setUser`. |
| `capturePages` | `true` | Send page views, Web Vitals, and browser errors. |
| `captureConsole` | `true` | Copy browser `console` calls into the page view's trace (at most 500 per page). |
| `captureXhr` | `true` | Trace `XMLHttpRequest` calls too (Angular's `HttpClient`, axios). |
| `resolveFrames` | `true` | Read the page's own source maps so errors group by your source. |
| `flushIntervalMs` | `1000` | How often browser spans are sent, in ms. |
| `hud` | `"auto"` | The in-page [HUD](/docs/hud/). `"auto"` asks `{endpoint}/api/info` once and shows it when the server's read API answers. `true` shows it; `false` hides it and reads nothing back. |
| `slowMs` | `500` | The HUD shows requests at or over this many ms as "warning". |
| `readServer` | follows `hud` | Read traces back from the server after each call. Off with a send-only server. |
| `serverStatsDelayMs` | `400` | With `readServer`, how long to wait after a response before reading its server stats. |
| `maxRecent` | `30` | How many recent requests `lens.recorder` keeps. |
| `framework` | none | Render stats and timings from a UI framework. The React package sets it. |
| `router` | none | Vue only: a vue-router instance. Each finished navigation is a page view. |
| `lens` | none | Vue only: use this running instance instead of starting one. |

The script tag takes `data-endpoint`, `data-release`, `data-enabled="false"`, `data-console="false"`,
`data-xhr="false"`, `data-hud` (`auto`, `true`, or `false`; default `auto`), and `data-slow-ms`. Svelte's
`trackNavigation` takes `mode` (`"history"` or `"hash"`) and `lens`. See
[Vue, Angular, Svelte, and plain JS](/docs/browser/).

## Command line

`@wizeworks/lens-cli` and its Vite, webpack, and Next.js plugins upload browser source maps.

| Flag | Plugin option | Variable | Default |
|---|---|---|---|
| `--url` | `url` | `WIZELENS_URL`, then `WIZELENS_HUB` | `http://localhost:5960` |
| `--token` | `token` | `WIZELENS_TOKEN`, then `WIZELENS_HUB_TOKEN` | none |
| `--release` | `release` | `WIZELENS_RELEASE`, then `npm_package_version` | the `package.json` version |
| `--project` | `project` | `WIZELENS_PROJECT` | none (hub only; the cloud takes it from the key) |
| `--url-prefix` | `urlPrefix` | | none |
| `--delete` | `deleteAfterUpload` | | off |
| | `upload` | | `true`; `false` skips the upload |
| | `failOnError` | | `false`; `true` fails the build when the upload fails |

See [Source maps](/docs/source-maps/).

## Environment variables

| Variable | Used by | Means |
|---|---|---|
| `WIZELENS_ENABLED` | .NET, Node, Java, Python, Go | Turn WizeLens on (`true`) or off (`false`). Default: .NET and Node, on in development only; Java, Python, and Go, on everywhere. |
| `WIZELENS_DASHBOARD` | .NET, Node | Serve the dashboard, read API, and MCP (`true`), or send only (`false`). |
| `WIZELENS_HUD` | .NET, Node | Put the HUD on the app's HTML pages while the dashboard is served (`true`), or not (`false`). Default `true`. |
| `WIZELENS_HUB` | .NET, Node, Java, Python, Go | Send to this hub or cloud. |
| `WIZELENS_HUB_TOKEN` | .NET, Node, Java, Python, Go | The hub token, or a cloud ingest key. |
| `WIZELENS_PROJECT` | .NET, Node, Java, Python, Go | Project name on a shared hub. |
| `WIZELENS_RELEASE` | .NET, Node, command line | The app's version (`service.version` on every span), and the release the command line stores maps under. |
| `OTEL_SERVICE_VERSION` | .NET, Node | The app's version when `WIZELENS_RELEASE` is not set. |
| `OTEL_SERVICE_NAME` | Auto installs, Java, Python, Go | The service name. |
| `WIZELENS_PACKAGES` | .NET, Node, Java, Python, Go | `false` stops the package report for the known-vulnerability check. Default `true`. |
| `WIZELENS_LOGS_OUTSIDE` | .NET, Node | Keep log lines outside a request (`true`/`false`). |
| `WIZELENS_LOGS_MIN_LEVEL` | .NET, Node | Lowest level kept outside a request: `trace`, `debug`, `info`, `warn`, `error`, `critical`. |
| `WIZELENS_LOGS_SAMPLE_RATE` | .NET, Node | Share of lines outside a request below warn that are kept, 0 to 1. |
| `WIZELENS_SAMPLE_RATE` | .NET, Node, Java, Python, Go | Sampling rate, 0 to 1. |
| `WIZELENS_KEEP_SLOW_MS`, `WIZELENS_KEEP_ERRORS` | Java, Python, Go | What sampling always keeps. |
| `WIZELENS_CAPTURE_BODY`, `WIZELENS_CAPTURE_SQL_PARAMETERS` | Java, Python, Go | Request and response bodies; SQL parameters. |
| `WIZELENS_CAPTURE_HEADERS` | Go | Request and response headers. Default `true`. |
| `WIZELENS_CAPTURE_LOGS` | Python | `logging` lines. Default `true`. |
| `WIZELENS_REDACT_KEYS` | Java, Python, Go | More key fragments to redact. |
| `WIZELENS_AUTO_SKIP` | Node auto install | Hooks to leave off, comma-separated. See [Install with no code change](/docs/auto-install/#settings). |
| `WIZELENS_URL`, `WIZELENS_TOKEN` | Command line | The hub or cloud to upload source maps to, and its key. They come before `WIZELENS_HUB` and `WIZELENS_HUB_TOKEN`. |

Java also reads each `WIZELENS_*` variable as a system property: `-Dwizelens.sample.rate=0.1`.

## Redaction

Before anything is stored, a value is replaced with `[redacted]` when its key contains any of: `authorization`, `cookie`,
`password`, `passwd`, `secret`, `token`, `apikey`, `api_key`, or `connectionstring` (any case). This covers attributes,
database parameter names, and headers.

- `Set-Cookie` keeps each cookie's name and flags: `sid=[redacted]; Path=/; HttpOnly`.
- URL queries keep their keys: `?token=[redacted]&page=2`.
- JWTs, AWS, Stripe, GitHub, Slack, and Google keys, private keys, and card numbers found inside any value or log line
  become a typed marker, such as `[redacted:jwt]` or `[redacted:card]`.

`RedactKeys` (.NET) and `redactKeys` (Node) replace the list, so include the defaults you want to keep. Java, Python, and
Go add to it with `WIZELENS_REDACT_KEYS`. Hub and cloud projects add more keys in Settings.
