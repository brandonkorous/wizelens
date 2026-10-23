---
title: The local hub
description: One place for the traces, logs, and metrics of every service on your machine or team network, kept for 7 days.
---

## Start it

```bash
npx @wizeworks/lens-hub
# or
docker run -p 5960:5960 -v wizelens:/data ghcr.io/brandonkorous/wizelens-hub
```

Open http://localhost:5960/_wizelens/.

## Point your services at it

Set these where each service runs, then restart it:

```bash
WIZELENS_HUB=http://localhost:5960                  # .NET and Node add-ons
WIZELENS_PROJECT=my-shop                            # optional: groups services by project
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:5960   # any other OpenTelemetry app: see Java, Python, and Go
```

Each service keeps its own dashboard too.

## What you get

- **Everything in one dashboard,** kept for 7 days in one SQLite file, with the same pages as the in-app dashboard.
- **Projects and environments.** The top-bar menu filters by them.
- **It knows your services.** Which are online, idle, or offline, what they run on, and when they last sent data.
- **Any language.** OTLP over HTTP, JSON or protobuf: traces, logs, and metrics.
- **One MCP endpoint** for every service, with `--mcp`.
- **Uptime checks** that call your sites and APIs on a schedule from this machine. See [Uptime checks](/docs/uptime/).
- **Saved views and dashboards:** the star saves the page you are on; dashboards put metric charts of your choice on one page.
- **SLOs and Apdex,** like the cloud's: error budgets, burn rates, and a target time per service.
- **Alerts,** like the cloud's: to Slack, Teams, Discord, PagerDuty, or a webhook (no email). Webhooks may be plain http or on
  your own network.
- **Problems, Security, and Tags,** like the cloud's: what is above normal and why, risks from real traffic, known-vulnerable
  packages (OSV), and named searches under **Settings → Tags**. See [Problems](/docs/problems/), [Security](/docs/security/),
  and [Tags](/docs/tags/).
- **Resolve and ignore errors;** a resolved error that comes back shows as **Regressed**.
- **Hosts and Kubernetes** from the OpenTelemetry Collector. See [Hosts and Kubernetes](/docs/kubernetes/).

An OpenTelemetry app shows as "Idle" between sends. That is normal: it only sends when it has data.

## Share it with your team

Run it with `--host 0.0.0.0 --token <text>`. Then:

- Add-ons send `WIZELENS_HUB_TOKEN=<text>`.
- OpenTelemetry apps send `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <text>`.
- In a browser, open `/_wizelens/?token=<text>` once.

## Options

| Flag | Environment variable | Default |
|---|---|---|
| `--port <n>` | `WIZELENS_HUB_PORT` | `5960` |
| `--host <addr>` | `WIZELENS_HUB_HOST` | `127.0.0.1` (this machine only) |
| `--data <file>` | `WIZELENS_HUB_DATA` | `~/.wizelens/hub/hub.db` (`memory` for none) |
| `--token <text>` | `WIZELENS_HUB_TOKEN` | none |
| `--retention <time>` | `WIZELENS_HUB_RETENTION` | `7d` |
| `--log-retention <time>` | `WIZELENS_HUB_LOG_RETENTION` | same as `--retention` (see [Logs](/docs/logs/)) |
| `--max-traces <n>` | `WIZELENS_HUB_MAX_TRACES` | `50000` |
| `--max-metric-points <n>` | `WIZELENS_HUB_MAX_METRIC_POINTS` | `2000000` raw points |
| `--slow-query-ms <n>` | `WIZELENS_HUB_SLOW_QUERY_MS` | `100`: a database call this slow is slow |
| `--n-plus-one <n>` | `WIZELENS_HUB_N_PLUS_ONE` | `5` similar calls in a request make an N+1 |
| `--redact-keys <a,b>` | `WIZELENS_HUB_REDACT_KEYS` | none: hide keys that contain these, on top of the built-in list |
| `--mcp` | `WIZELENS_HUB_MCP=1` | off |
| `--no-uptime` | `WIZELENS_HUB_UPTIME=0` | checks on |
| `--no-osv` | `WIZELENS_HUB_OSV=0` | packages checked against OSV |
| `--import <file>` | | Copy an add-on's `.wizelens/traces.db` in at start |
| `--sourcemaps <dir>` | `WIZELENS_HUB_SOURCEMAPS=a,b` | Read browser [source maps](/docs/source-maps/) from a build folder. Can repeat |

`wizelens-hub --help` lists every option.

## Project settings

Each project can set its own slow query and N+1 thresholds and more redacted keys in **Settings → Thresholds and hidden
keys**, and a shorter retention in **Settings → Data retention**. Thresholds and keys apply to data that arrives after you save. A shorter retention
deletes older data at the next cleanup, within minutes.

## In code

```ts
import { createHub } from "@wizeworks/lens-hub";

const hub = createHub({ port: 5960, storagePath: "./hub.db" });
console.log(await hub.listen());
```
