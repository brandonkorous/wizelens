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
- **Read key** (`wl_rk_…`): one or more projects, read-only. For scripts, CI, and agents with no person to sign in.

Only a hash of each key is stored. The secret is shown once, when you make the key.

## AI apps

Claude and other MCP clients connect without a key: add `https://mcp.wizelens.com` (or `<your cloud>/_wizelens/mcp`), sign
in, and pick the projects the app may read. It keeps read-only access until you remove it under **Account → Connected
apps**; admins see everyone's under **Team → Connected apps**. See [AI access](/docs/ai-access/).

## Traces across projects

Many front ends often share one API. Put each app in the project of the team that owns it: a trace that goes from a front
end in one project to the API in another still opens as one trace. The cloud adds the parts from the other projects you
may read, in the same organization only. A read key or a connected app gets only its own projects. Lists, stats, and alerts stay per project.

## History

Pages are computed on the server from stats tables, never from a sample of traces, so 7- and 30-day pages answer in well
under a second on busy projects. Each organization keeps traces for 30 days by default (1 to 400). Each project can keep
its logs for more or less time than that, under **Team → Projects → Logs kept** (see [Logs](/docs/logs/)).

## Alerts

A rule watches one value over a window of 5 minutes to 24 hours: error rate, p95 or average latency, request count, new
errors, slow queries, the count of a log search, or one OpenTelemetry metric. It fires when the value goes above or below your threshold. A notice is
sent only when the state changes, to a webhook or a Slack incoming webhook:

```text
Error rate is 3.4% (above 2%)
Error rate is 1.1% (no longer above 2%)
```

Webhook URLs must be https and may not point at private addresses, unless the cloud runs with `--allow-private-webhooks`.

Pick **is above normal** as the condition, on error rate, p95, or requests, to skip the threshold. The rule then checks every
service and endpoint against the same window at the same time in the 4 weeks before, with high, medium, or low sensitivity,
and names the one that broke:

```text
p95 duration is above normal on pay POST /api/charge: 412 ms (normal 31 ms, alerts above 46 ms)
Part of a problem: Error rate above normal on pay and 2 more. Suspected cause: pay 2.0.0 was released as it started.
```

Every fired notice links to the [problem](/docs/problems/) it is part of, when there is one.

## Uptime checks and status pages

The cloud calls your URLs every 1 to 60 minutes and keeps uptime, response time, incidents, and certificate end dates.
Members and above add and change checks; every change is in the audit log. A project can turn on a public status page:
an unguessable, read-only link that shows check names, state, uptime, and incident times. See
[Uptime checks](/docs/uptime/).

## Share links

A share link opens one trace, read-only, for anyone with the link, for 1 to 30 days. You can revoke it. Nothing else is
reachable with it. It shows the parts of the trace its maker may read; after the maker leaves the organization, only the
shared project's part.

## Plans and billing

Only the hosted cloud at app.wizelens.com has plans. Every plan has unlimited users, alerts, share links, and MCP access.
See [Pricing](/pricing/) for the price check.

| Plan | Price per month | Data per month | History (max) | Adds |
|---|---|---|---|---|
| Free | $0 | 10 GB | 14 days | Stops at 10 GB until the 1st |
| Team | $29 | 50 GB | 30 days | Extra data instead of a stop; a spend cap |
| Business | $99 | 150 GB | 90 days | SAML and OIDC single sign-on, SCIM, audit log export |
| Enterprise | Custom | Custom | Up to 400 days | Set by contract |

- **Extra data** on Team and Business is priced in steps on the GB above the plan's included GB: the first 500 GB at
  $0.30 a GB, the next 1,500 GB at $0.20, and the rest at $0.10. Team at 120 GB a month is $29 + 70 × $0.30 = $50.
- **Yearly** billing is 12 months for the price of 10: Team $290, Business $990. Extra data is billed each month, on a
  usage invoice for the calendar month (UTC), so the steps start again on the 1st on monthly and yearly plans alike.
- **A GB** is 1,000,000,000 bytes of request body the cloud accepts on ingest and OTLP, counted as sent: a compressed body counts
  compressed. Reading, search, alerts, and MCP calls never count. Sampling and compression both lower it.
- **At the Free limit**, ingest and OTLP answer HTTP 429 ("This organization reached the Free plan's 10 GB for this
  month") until the 1st (UTC) or an upgrade. The add-ons and OpenTelemetry exporters back off on 429, and what you
  already sent stays readable. Owners and admins get an email at 80% and 100%.
- **Spend cap** (Team and Business, optional): an owner sets a monthly limit for extra data, in dollars. Past it, ingest
  answers 429 ("This organization reached its monthly spend cap of $N") until the 1st.
- **History** is capped by the plan. A downgrade lowers the organization's retention to the new plan's maximum.
- **Cancel** under Manage billing. The plan runs to the end of the paid period, then the organization moves to Free.

When you self-host, billing is off: the cloud has no plans, no caps, and no billing pages unless it starts with Stripe
keys. Every organization is unlimited, and `--retention-days` sets history as before.

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
| `--settle-workers <n>` | `WIZELENS_CLOUD_SETTLE_WORKERS` | Scale mode: threads that index new traces. `0` uses the main thread. Default: CPUs − 1, at most 4 |
| `--allow-private-webhooks` | `WIZELENS_CLOUD_ALLOW_PRIVATE_WEBHOOKS=1` | off (alert webhooks and uptime checks may not reach private addresses) |
