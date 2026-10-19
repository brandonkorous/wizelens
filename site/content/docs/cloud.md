---
title: WizeLens Cloud
description: The same dashboard for a whole team, with accounts, history, alerts, share links, and scoped AI access. Run it yourself on Postgres.
---

## Try it on your machine

```bash
npx @wizeworks/lens-cloud
```

This runs Postgres in-process (PGlite) and keeps data in `./.wizelens-cloud`. Open http://localhost:5970/_wizelens/ and
create the first account. PGlite is for trials and tests. Use real Postgres for a team.

## Run it for a team

Run it with Postgres, on a server your team can reach:

```bash
POSTGRES_PASSWORD=<a long secret> WIZELENS_CLOUD_PUBLIC_URL=https://wizelens.example.com \
  docker compose -f deploy/docker-compose.cloud.yml up -d
```

Put it behind https (any reverse proxy). With an https public URL, the sign-in cookie is marked secure.

## Connect your apps

Open the public URL and create the first account: you own the first organization. On the **Team** page, invite people
(send them the link), add projects, and make an **ingest key** for each app. Then set on each app, and restart it:

```bash
WIZELENS_HUB=https://wizelens.example.com
WIZELENS_HUB_TOKEN=wl_ik_...                   # the ingest key
```

In production, also set `WIZELENS_ENABLED=true`. The app then sends only and serves nothing: see [Production](/docs/production/).

OpenTelemetry apps use `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer wl_ik_...`.

## Teams and roles

Organizations hold projects. People join an organization with a role:

| Role | Can |
|---|---|
| Viewer | Read everything in the organization |
| Member | Also make alerts and share links |
| Admin | Also manage projects, keys, and members |
| Owner | Also manage owners. An organization always keeps one owner. |

People join with an invite link (7 days, one use). Run the cloud with `--signup open` to let anyone sign up; each new
person then gets their own organization. Org changes, member changes, keys, shares, and every MCP call go to the audit log.

## Keys

- **Ingest key** (`wl_ik_…`): one project. Apps send data with it. The project comes from the key, never from the sender.
- **Read key** (`wl_rk_…`): one or more projects, read-only. For AI agents and scripts.

Only a hash of each key is stored. The secret is shown once, when you make the key.

## Traces across projects

Many front ends often share one API. Put each app in the project of the team that owns it: a trace that goes from a front
end in one project to the API in another still opens as one trace. The cloud adds the parts from the other projects you
may read, in the same organization only. A read key gets only its own projects. Lists, stats, and alerts stay per project.

## History

Pages are computed on the server from stats tables, never from a sample of traces, so 7- and 30-day pages answer in well
under a second on busy projects. Each organization keeps traces for 30 days by default (1 to 400).

## Alerts

A rule watches one value over a window of 5 minutes to 24 hours: error rate, p95 or average latency, request count, new
errors, slow queries, or one OpenTelemetry metric. It fires when the value goes above or below your threshold. A notice is
sent only when the state changes, to a webhook or a Slack incoming webhook:

```text
Error rate is 3.4% (above 2%)
Error rate is 1.1% (no longer above 2%)
```

Webhook URLs must be https and may not point at private addresses, unless the cloud runs with `--allow-private-webhooks`.

## Share links

A share link opens one trace, read-only, for anyone with the link, for 1 to 30 days. You can revoke it. Nothing else is
reachable with it. It shows the parts of the trace its maker may read; after the maker leaves the organization, only the
shared project's part.

## Options

| Flag | Environment variable | Default |
|---|---|---|
| `--database <url>` | `DATABASE_URL` | `pglite:./.wizelens-cloud` (`postgres://…`, `pglite:<folder>`, or `memory`) |
| `--port <n>` | `PORT` | `5970` |
| `--host <addr>` | `WIZELENS_CLOUD_HOST` | `0.0.0.0` |
| `--public-url <url>` | `WIZELENS_CLOUD_PUBLIC_URL` | the request's own address |
| `--signup <invite\|open>` | `WIZELENS_CLOUD_SIGNUP` | `invite` |
| `--retention-days <n>` | `WIZELENS_CLOUD_RETENTION_DAYS` | `30` |
| `--ingest-per-minute <n>` | `WIZELENS_CLOUD_INGEST_PER_MINUTE` | `1200` ingest calls per key |
| `--allow-private-webhooks` | `WIZELENS_CLOUD_ALLOW_PRIVATE_WEBHOOKS=1` | off |
