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
Admins export the audit log as CSV or JSON (Business and Enterprise on the hosted cloud).

**SCIM.** Under Team, SCIM, an admin makes a token and pastes it with the SCIM base URL
(`<public-url>/_wizelens/api/auth/scim/v2`) into Okta, Entra ID, or another identity provider. People it creates join as
members, and people it deactivates leave the organization (owners stay). Admins set roles in WizeLens. On the hosted
cloud, SCIM and single sign-on are on Business and Enterprise.

A member or viewer can have their own role on one project: more (up to admin of that project), less, or no access.
No access hides the project everywhere: the dashboard, trace links across projects, connected apps, and AI agents.
Owners and admins always keep their organization role. Set it in **Team → Projects → Access**.

The audit log pages back through all history and filters by action and by person. The export (CSV or JSON, on plans
with audit export) follows the same filters, and is itself in the log.

## Project settings

Each project can set its own slow query and N+1 thresholds, more redacted keys, and a shorter retention than its
organization, in **Settings → This project**. Owners, admins, and admins of the project change them. Thresholds and
keys apply to data that arrives after you save. A shorter retention deletes older data within minutes.

## Keys

- **Ingest key** (`wl_ik_…`): one project. Apps send data with it. The project comes from the key, never from the sender.
- **Read key** (`wl_rk_…`): one or more projects, read-only. For scripts, CI, and agents with no person to sign in.

Only a hash of each key is stored. The secret is shown once, when you make the key.

- **Expiry:** a key can stop working after 30, 90, 180, or 365 days. Expired keys stay in the list until revoked.
- **Scopes:** an ingest key can send only traces, logs, or metrics; a read key can use only the API or only MCP.
- **Rotate:** a new secret for the same key, with the same projects, scopes, and lifetime. The old secret keeps
  working for 24 hours, so apps can switch without a gap.

## AI apps

Claude and other MCP clients connect without a key: add `https://mcp.wizelens.com` (or `<your cloud>/_wizelens/mcp`), sign
in, and pick the projects the app may read. It keeps read-only access until you remove it under **Account → Connected
apps**; admins see everyone's under **Team → Connected apps**. See [AI access](/docs/ai-access/).

## Traces across projects

Many front ends often share one API. Put each app in the project of the team that owns it: a trace that goes from a front
end in one project to the API in another still opens as one trace. The cloud adds the parts from the other projects you
may read, in the same organization only. A read key or a connected app gets only its own projects.

## All projects

Pick **All projects** in the project menu to see every project of the organization on one screen: requests, errors,
logs, services, search, alerts, SLOs, uptime checks, and saved views. With more than one organization, the same menu
picks the organization first.

- **Totals add up.** Charts and counts are the sum of your projects.
- **Same names stay apart.** Two projects with a service called `api` show it twice, as **api · Shop** and
  **api · Admin**. Open one and you see that project's service only.
- **Only what you may read.** A project hidden from you stays hidden, and nothing from another organization ever
  shows. Each row of data carries its organization, and the database itself refuses a read that does not name one.
- **Changes go to one project.** A new alert, SLO, or uptime check asks which project it belongs to. Settings, Apdex
  targets, status pages, and share links belong to one project: pick it in the menu, or from the list on the page.
- **Saved views** made under All projects belong to the whole organization and open there.
- **AI agents** that read more than one project read all of them together when a call names none.

## History

Pages are computed on the server from stats tables, never from a sample of traces, so 7- and 30-day pages answer in well
under a second on busy projects. Each organization keeps traces for 30 days by default (1 to 400). Each project can keep
its logs for more or less time than that, under **Team → Projects → Logs kept** (see [Logs](/docs/logs/)).

## Alerts

A rule watches one value over a window of 5 minutes to 24 hours: error rate, p95 or average latency, request count, new
errors, slow queries, the count of a log search, or one OpenTelemetry metric. It can watch everything, one service, or one
endpoint. It fires when the
value goes above, at or above, below, or at or below your threshold. A notice is sent when the state changes, and again every
15 minutes to a day while it keeps firing, if you ask for reminders. **Acknowledge** stops the reminders; **mute** keeps it
quiet for a while or until you unmute it. Notices go to up to five channels: Slack, Microsoft Teams, Discord, PagerDuty, a
webhook, or email to members:

```text
Error rate is 3.4% (above 2%)
Error rate is 3.1% (still above 2%)
Error rate is 1.1% (no longer above 2%)
```

A rule can also watch an **SLO's burn rate**. On the **SLOs** page, an SLO says how much of a service's or an endpoint's
requests must succeed, or finish within a time, over 7 or 30 days; it shows the error budget left and how fast it burns. Set the
**Apdex** target of each service there too; the Overview and the service pages show the score.

Each rule has its own page: its value against the line over time, every notice and change, and a link to the traces behind
it. **Alert on this** on a service, an endpoint, an error, or a metric chart opens a new rule filled in for it. The hub runs
the same alerts, without email.

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

A share link opens one trace, or one page as it was when you made the link, read-only, for anyone with the link, for 1 to
30 days. Use the link button in the top bar on a page. You can revoke it. Nothing else is reachable with it. It shows the parts of the trace its maker may read; after the maker leaves the organization, only the
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
| `--slow-query-ms <n>` | `WIZELENS_CLOUD_SLOW_QUERY_MS` | `100`: a database call this slow is slow |
| `--n-plus-one <n>` | `WIZELENS_CLOUD_N_PLUS_ONE` | `5` similar calls in a request make an N+1 |
| `--settle-workers <n>` | `WIZELENS_CLOUD_SETTLE_WORKERS` | Scale mode: threads that index new traces. `0` uses the main thread. Default: CPUs − 1, at most 4 |
| `--allow-private-webhooks` | `WIZELENS_CLOUD_ALLOW_PRIVATE_WEBHOOKS=1` | off (alert webhooks and uptime checks may not reach private addresses) |
| `--stripe-secret-key <key>` | `WIZELENS_CLOUD_STRIPE_SECRET_KEY` | none: billing is off and every organization is unlimited. With it (`sk_…` or `rk_…`), plans and limits apply and new organizations start on Free |
| `--stripe-webhook-secret <s>` | `WIZELENS_CLOUD_STRIPE_WEBHOOK_SECRET` | none; required with a Stripe key. The webhook goes to `<public-url>/_wizelens/api/auth/stripe/webhook` |
| `--stripe-prices <json>` | `WIZELENS_CLOUD_STRIPE_PRICES` | none; required with a Stripe key. The price and meter ids `stripe-setup` prints |

To turn billing on, run `wizelens-cloud stripe-setup --stripe-secret-key sk_… --public-url https://lens.example.com`
once. It makes the Team and Business products with monthly and yearly prices, the `wizelens_gb` meter with its
graduated price, and the webhook (with the events `checkout.session.completed` and `customer.subscription.created`,
`.updated`, and `.deleted`), then prints the three options to deploy with. A rerun reuses what exists. Organizations that
existed before billing was turned on stay unlimited until you move them.

`wizelens-cloud plan set <org id or slug> <free|team|business|enterprise|unlimited> [--gb N] [--retention-days N]
[--database <url>]` sets a plan by hand, for an Enterprise contract (with its own GB and retention) or for support.
The change goes to the organization's audit log.
