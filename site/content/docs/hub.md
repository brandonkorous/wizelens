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
- **Saved views and dashboards:** the star saves the page you are on; dashboards put metric charts of your choice on one page.
- **SLOs and Apdex,** like the cloud's: error budgets, burn rates, and a target time per service.
- **Alerts,** like the cloud's: to Slack, Teams, Discord, PagerDuty, or a webhook (no email). Webhooks may be plain http or on
  your own network.

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
| `--max-traces <n>` | `WIZELENS_HUB_MAX_TRACES` | `50000` |
| `--max-metric-points <n>` | `WIZELENS_HUB_MAX_METRIC_POINTS` | `2000000` raw points |
| `--mcp` | `WIZELENS_HUB_MCP=1` | off |
| `--import <file>` | | Copy an add-on's `.wizelens/traces.db` in at start |

`wizelens-hub --help` lists every option.

## In code

```ts
import { createHub } from "@wizeworks/lens-hub";

const hub = createHub({ port: 5960, storagePath: "./hub.db" });
console.log(await hub.listen());
```
