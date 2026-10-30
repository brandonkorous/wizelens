# @wizeworks/lens-hub

The local hub of [WizeLens](https://github.com/wizeworksllc/wizelens): one place for the traces and metrics of every service on your
machine or team network, with the full dashboard, OTLP intake (traces, logs, and metrics), and a read-only MCP endpoint.

```bash
npx @wizeworks/lens-hub
# or
docker run -p 5960:5960 -v wizelens:/data ghcr.io/wizeworksllc/wizelens-hub
```

Open http://localhost:5960/_wizelens/. Then point your services at it and restart them:

```bash
WIZELENS_HUB=http://localhost:5960                  # WizeLens add-ons (.NET and Node)
WIZELENS_PROJECT=my-shop                            # optional: group services by project
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:5960   # any OpenTelemetry app
```

## Options

| Flag | Environment variable | Default |
|---|---|---|
| `--port <n>` | `WIZELENS_HUB_PORT` | `5960` |
| `--host <addr>` | `WIZELENS_HUB_HOST` | `127.0.0.1` (this machine only) |
| `--data <file>` | `WIZELENS_HUB_DATA` | `~/.wizelens/hub/hub.db` (`memory` for none) |
| `--token <text>` | `WIZELENS_HUB_TOKEN` | none |
| `--retention <time>` | `WIZELENS_HUB_RETENTION` | `7d` |
| `--max-traces <n>` | `WIZELENS_HUB_MAX_TRACES` | `50000` |
| `--max-metric-points <n>` | `WIZELENS_HUB_MAX_METRIC_POINTS` | `2000000` raw points (they are also kept for `--retention`; rollups are not capped) |
| `--mcp` | `WIZELENS_HUB_MCP=1` | off |
| `--import <file>` | | Copy an add-on's `.wizelens/traces.db` in at start |

To share the hub with a team, run it with `--host 0.0.0.0 --token <text>`. Services send `WIZELENS_HUB_TOKEN`; OTLP apps send
`OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <text>`; in a browser, open `/_wizelens/?token=<text>` once.

## Stats

The dashboard asks the hub for whole pages (`GET /_wizelens/api/models/{page}?range=&project=&env=`), computed from stats tables
in the hub file: per-trace facts and rollups in 10 s, 5 min, and 1 h buckets. Ranges reach the hub's `--retention`. Traces are
settled a few seconds after their last span (every 2 s, at most 150 ms at a time); pages say "Preparing stats" while traces wait.
Files from older hubs upgrade when opened and backfill, newest traces first. See `docs/CONTRACT.md`, "Stats tables".

## Metrics

OpenTelemetry apps send metrics to `POST /v1/metrics` (JSON or protobuf): gauges, sums, histograms, exponential histograms
(kept as explicit buckets), and summaries (kept as count and sum). WizeLens add-ons send theirs in their batches. The Metrics page
reads `GET /_wizelens/api/models/metrics?range=1h&project=&env=&service=&metric=&group=&stat=&q=`, computed in the hub from
metric rollups (per series, in 10 s, 5 min, and 1 h buckets, written as points arrive), so every range reads all of its points.
With `--mcp`, agents get `list_metrics` and `get_metric`.

## In code

```ts
import { createHub } from "@wizeworks/lens-hub";

const hub = createHub({ port: 5960, storagePath: "./hub.db" });
console.log(await hub.listen());
```

The wire format is in [CONTRACT.md](https://github.com/wizeworksllc/wizelens/blob/main/docs/CONTRACT.md#local-hub-v06-phase-2). MIT licensed.
