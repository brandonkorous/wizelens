# @wizeworks/lens-cloud

The cloud service of [WizeLens](https://github.com/brandonkorous/wizelens): the full dashboard for many teams, with accounts,
projects, 30 days of history computed on the server, alerts, share links, and AI access through read keys.

```bash
# Try it on your machine (Postgres in-process, data in ./.wizelens-cloud)
npx @wizeworks/lens-cloud

# For a team: Postgres in Docker
POSTGRES_PASSWORD=<a long secret> docker compose -f deploy/docker-compose.cloud.yml up -d
```

Open http://localhost:5970/_wizelens/ and create the first account. Make an ingest key on the Team page, then on each app:

```bash
WIZELENS_HUB=http://localhost:5970
WIZELENS_HUB_TOKEN=wl_ik_...
```

## Options

| Flag | Environment variable | Default |
|---|---|---|
| `--database <url>` | `DATABASE_URL` | `pglite:./.wizelens-cloud` (`postgres://…`, `pglite:<folder>`, or `memory`) |
| `--port <n>` | `PORT` | `5970` |
| `--host <addr>` | `WIZELENS_CLOUD_HOST` | `0.0.0.0` |
| `--public-url <url>` | `WIZELENS_CLOUD_PUBLIC_URL` | the request's own address |
| `--signup <invite\|open>` | `WIZELENS_CLOUD_SIGNUP` | `invite` |
| `--retention-days <n>` | `WIZELENS_CLOUD_RETENTION_DAYS` | `30` |
| `--allow-private-webhooks` | `WIZELENS_CLOUD_ALLOW_PRIVATE_WEBHOOKS=1` | off |

Put it behind https. With an https public URL, the sign-in cookie is marked secure. PGlite is for trials and tests; use Postgres
for real teams. Check a running cloud end to end with `node scripts/cloud-smoke.mjs <url>` from the repo (it needs a fresh database).

## Stats

Pages are computed from stats tables, never from a sample of traces: per-trace facts (request, trace, log, and slow span rows) and
rollups in 10 s, 5 min, and 1 h buckets, so 30-day pages on busy projects answer in well under a second. A background job settles
traces a few seconds after their last span (every 3 s, one instance at a time through a Postgres advisory lock); pages say
"Preparing stats" while traces wait, for example right after an upgrade, when existing traces are backfilled newest first.
Alerts on traces read the same tables. See `docs/CONTRACT.md`, "Stats tables".

## Metrics

Apps send OpenTelemetry metrics to `POST /v1/metrics` with the ingest key (JSON or protobuf; gauges, sums, histograms,
exponential histograms, and summaries). WizeLens add-ons send theirs in their batches. The Metrics page reads
`GET /_wizelens/api/models/metrics?project=&range=&env=&service=&metric=&group=&stat=&q=` (member or read key), computed from
metric rollups (per series, in 10 s, 5 min, and 1 h buckets, written as points arrive), so every range reads all of its points.
Points and rollups follow the organization's retention. Alert rules can watch
one metric: `{ "metric": "metric", "metricName": "process.cpu.utilization", "metricStat": "avg", "metricService": "", ... }`, with
`metricStat` one of `last`, `avg`, `max`, `p95`, `p99`, `rate`, and the threshold in the metric's own unit (seconds, bytes, or
0 to 1 for ratios). Read keys get `list_metrics` and `get_metric` over MCP.

## In code

```ts
import { createCloud } from "@wizeworks/lens-cloud";

const cloud = await createCloud({ database: process.env.DATABASE_URL, publicUrl: "https://wizelens.example.com" });
console.log(await cloud.listen());
```

The API, roles, keys, and storage are in [CONTRACT.md](https://github.com/brandonkorous/wizelens/blob/main/docs/CONTRACT.md#cloud-v07-phase-3). MIT licensed.
