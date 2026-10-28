---
title: WizeLens Cloud
description: The same dashboard for a whole team, with accounts, SSO, history, alerts, uptime checks, and scoped AI access. Use it hosted, or run it on Postgres.
---

## Try it on your machine

```bash
npx @wizeworks/lens-cloud
```

This runs Postgres in-process (PGlite) and keeps data in `./.wizelens-cloud`. Open the setup link it prints
(`http://localhost:5970/_wizelens/#/setup?token=…`) to create the first account. The link works once. PGlite is for trials
and tests. Use real Postgres for a team.

## Run it for a team

Run it with Postgres, on a server your team can reach. Put the settings in `deploy/.env`, next to the compose file:

```bash
POSTGRES_PASSWORD=<a long secret>
WIZELENS_CLOUD_AUTH_SECRET=<32+ random characters: openssl rand -base64 32>
WIZELENS_CLOUD_PUBLIC_URL=https://wizelens.example.com
```

Then start it with `docker compose -f deploy/docker-compose.cloud.yml up -d`. Keep the auth secret: it signs sessions and
encrypts two-step secrets.

Put it behind https (any reverse proxy). With an https public URL, the sign-in cookie is marked secure. For email, set
`WIZELENS_CLOUD_RESEND_API_KEY` or `WIZELENS_CLOUD_SMTP_URL`, and `WIZELENS_CLOUD_MAIL_FROM`; without them, emails go to the log.

**Scale mode** keeps spans, logs, metrics, and every stats and search table in ClickHouse, and accounts and settings in
Postgres, so heavy searches never slow sign-in or ingest. Pages and searches give the same answers in both modes. Set
`CLICKHOUSE_PASSWORD` and `WIZELENS_CLOUD_CLICKHOUSE_URL=http://wizelens:<password>@clickhouse:8123/wizelens`, then run
`docker compose -f deploy/docker-compose.cloud.yml --profile scale up -d`. To move data you already have, run
`wizelens-cloud copy-telemetry --database <postgres url> --clickhouse <url>` once before the switch.

## Connect your apps

Open the setup link from the log (`docker compose -f deploy/docker-compose.cloud.yml logs cloud`), or set
`WIZELENS_CLOUD_SETUP_TOKEN`, and create the first account: you own the first organization. Under **People & access**, invite
people (send them the link); under **Organization**, add projects; and under **Connect**, make an **ingest key** for each
app. Then set on each app, and restart it:

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
| Member | Also make alerts, tags, uptime checks, and share links |
| Admin | Also manage projects, keys, and members |
| Owner | Also manage owners, set the spend cap, and delete the organization. An organization always keeps one owner. |

People join with an invite link (7 days, one use). **Invite many** takes a pasted list of emails or a file (Excel, CSV,
or JSON, with an optional role per row) and gives you every invite link to download. Tick members to change their role
or remove them together. Run the cloud with `--signup open` to let anyone sign up; each new
person then gets their own organization. Org changes, member changes, keys, shares, and every MCP call go to the audit log.
Admins export the audit log as CSV or JSON (Business and Enterprise on the hosted cloud).

A member or viewer can have their own role on one project: more (up to admin of that project), less, or no access.
No access hides the project everywhere: the dashboard, trace links across projects, connected apps, and AI agents.
Owners and admins always keep their organization role. Set it in **People & access → Project access**.

The audit log pages back through all history and filters by action and by person. The export (CSV or JSON, on plans
with audit export) follows the same filters, and is itself in the log.

## Single sign-on and SCIM

Owners and admins connect OIDC (Okta, Entra ID, Google, Auth0, Keycloak) or SAML 2.0 under **People & access → Single sign-on**.
Sign-in works once you prove the email domain with a DNS TXT record; new people from that domain join as members, with a
confirmed email, and the sign-in page shows **Sign in with SSO**. OIDC needs the provider's origin in `--sso-origins`, so
the cloud fetches from no other place. SAML needs none.

Tick **Require single sign-on** on a proven provider to make it the only way in for its domain. Everyone at the domain
except owners is signed out at once; after that a password, a passkey, a password reset, or a new password account is
refused for them. Owners keep their password and two-step sign-in, to get in when the provider is down. Someone who made a
password account before, and never confirmed its email, is linked on their first single sign-on, and that password ends.

Under **People & access → User sync (SCIM)**, an admin makes a token and pastes it with the SCIM base URL
(`<public-url>/_wizelens/api/auth/scim/v2`) into Okta, Entra ID, or another identity provider. People it creates join as
members, and people it deactivates leave the organization (owners stay). Admins set roles in WizeLens. On the hosted
cloud, single sign-on and SCIM are on Business and Enterprise; a self-hosted cloud has both.

## Project settings

Each project can set its own slow query and N+1 thresholds, more redacted keys, and a shorter retention than its
organization. Thresholds and keys are under **Organization → Thresholds and hidden keys**, which has its own project
picker. Retention, for traces and logs of every project, is under **Organization → Data retention**, the one place it is
set. Owners, admins, and admins of the project change them. Thresholds and keys apply to data that arrives after you
save. A shorter retention deletes older data within minutes.

**Copy to other projects**, next to the project picker, copies one project's saved thresholds and hidden keys, and if
you tick it, its data retention, to every project you pick. It needs admin rights on each of them.

## Keys

- **Ingest key** (`wl_ik_…`): one project. Apps send data with it. The project comes from the key, never from the sender.
- **Read key** (`wl_rk_…`): one or more projects, read-only. For scripts, CI, and agents with no person to sign in.
- **Browser key** (`wl_bk_…`): one project, for a site with no WizeLens server, such as a static site. Its pages send
  page views, fetch calls, errors, and console lines straight to the cloud. The key is public, because it ships in page
  code, so it can do only that: it sends only browser spans, only from the sites you list (`https://shop.example.com`, or
  `https://*.example.com` for its subdomains), and it reads nothing. Change its sites with **Sites** on the key; the key
  stays the same. See [Static sites](/docs/browser/#static-sites).

Only a hash of each key is stored. The secret is shown once, when you make the key.

- **Expiry:** a key can stop working after 30, 90, 180, or 365 days. Expired keys stay in the list until revoked.
- **Scopes:** an ingest key can send only traces, logs, or metrics; a read key can use only the API or only MCP; a
  browser key can send only page spans or only console lines.
- **Rotate:** a new secret for the same key, with the same projects, scopes, and lifetime. The old secret keeps
  working for 24 hours, so apps can switch without a gap.
- **Many keys at once:** tick keys (the filter finds them by name, project, or kind), then **Rotate** or **Revoke**.
  Rotating many asks when the old secrets stop (at once, or in 1 hour to 7 days) and shows the new ones once, to
  download as CSV or JSON. Scripts use `POST /api/orgs/<org>/keys/rotate` and `/keys/revoke` with `{ "keyIds": [...] }`.

### Many apps at once

To onboard hundreds of services, choose **Import from a file** under **Organization → Projects** or **Connect →
Sending keys**. Drop an Excel sheet (`.xlsx`, the first sheet), a CSV, JSON, or a plain list of names, up to 5000
projects:

```csv
name,kind,sites,key name
Orders,ingest,,orders-api
Orders,ingest,,orders-worker
Shop web,browser,https://shop.example.com https://www.example.com,shop-pages
```

Only `name` is needed. `kind` is `ingest` (the default) or `browser`; a browser row lists its `sites`. `key name`
defaults to the project's name. Each row makes one key. A project with many services takes one row per service, each
with its own key name, and the first row makes the project. WizeLens shows each row and what it will make, and makes
nothing while a row is wrong. A name that is already a project gets a new key instead of a second project. All keys in the file get the expiry you
pick.

The new keys are shown once. Download them as CSV or JSON (each row has the project, its id, and the key), or copy
them, before you close the window. Scripts can send the same rows to `POST /api/orgs/<org>/projects/import` as
`{ "projects": [...], "expiresInDays": 90 }`, up to 500 at a time.

## AI apps

Claude and other MCP clients connect without a key: add `https://mcp.wizelens.com` (or `<your cloud>/_wizelens/mcp`), sign
in, and pick the projects the app may read. It keeps read-only access until you remove it under **Account → My
apps**; admins see everyone's under **People & access → Connected apps**. See [AI access](/docs/ai-access/).

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
its traces for less, and its logs for more or less, under **Organization → Data retention** (see [Logs](/docs/logs/)).

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

## Errors and tags

Resolve an error group, or ignore it for an hour, a day, a week, or for good. A resolved group that happens again shows as
**Regressed** and comes back to the list. In the cloud, a group can also be **assigned** to a member, and each change
writes an audit line. Insights get **Mark fixed** and **Dismiss**. [Tags](/docs/tags/) name a search, and everything it
finds wears that name in every list; members and up manage them under **Organization → Tags**, and each change is audited.

## Security

The **Security** page finds risks in the traffic your apps really serve, mapped to the OWASP Top 10, and lists the packages
your services run that have known vulnerabilities, checked against OSV. Only package names and versions are sent to OSV.
`--no-osv` turns the package check off. An alert rule can watch **New security risks**. See [Security](/docs/security/).

## Hosts and Kubernetes

Run the standard OpenTelemetry Collector with an ingest key, and the **Hosts** and **Kubernetes** pages show CPU, memory,
disk, and network per host, and nodes, pods, restarts, and out-of-memory kills. See [Hosts and Kubernetes](/docs/kubernetes/).

## Share links

A share link opens one trace, or one page as it was when you made the link, read-only, for anyone with the link, for 1 to
30 days. Use the link button in the top bar on a page. You can revoke it. Nothing else is reachable with it. It shows the parts of the trace its maker may read; after the maker leaves the organization, only the
shared project's part.

## Your account

**Account → Sign-in and security** has two-step sign-in with an authenticator app and 10 backup codes, and passkeys.
**Devices** lists where you are signed in, with sign-out per device. Breached passwords are refused (on Postgres), and
sign-in tries are limited per address.

**Account → Emails** sets digests per project (daily, weekly, or monthly, at your hour and time zone; weekly is on by
default), project health emails (a busy project went quiet for 2 hours, and when it is back), and, for owners and admins,
team change emails. Security emails are always on: password or email changed, two-step sign-in on or off, a passkey added
or removed, new backup codes, and a sign-in on a new browser. Team, health, and digest emails have a one-click stop link.

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
| `--clickhouse <url>` | `WIZELENS_CLOUD_CLICKHOUSE_URL` | none. Scale mode: telemetry in ClickHouse, `http://user:pass@host:8123/database` |
| `--port <n>` | `PORT` | `5970` |
| `--host <addr>` | `WIZELENS_CLOUD_HOST` | `0.0.0.0` |
| `--public-url <url>` | `WIZELENS_CLOUD_PUBLIC_URL` | the request's own address |
| `--mcp-url <url>` | `WIZELENS_CLOUD_MCP_URL` | none: another origin your proxy sends to MCP, such as `https://mcp.example.com` |
| `--signup <invite\|open>` | `WIZELENS_CLOUD_SIGNUP` | `invite` |
| `--retention-days <n>` | `WIZELENS_CLOUD_RETENTION_DAYS` | `30` |
| `--ingest-per-minute <n>` | `WIZELENS_CLOUD_INGEST_PER_MINUTE` | `1200` ingest calls per key |
| `--slow-query-ms <n>` | `WIZELENS_CLOUD_SLOW_QUERY_MS` | `100`: a database call this slow is slow |
| `--n-plus-one <n>` | `WIZELENS_CLOUD_N_PLUS_ONE` | `5` similar calls in a request make an N+1 |
| `--settle-workers <n>` | `WIZELENS_CLOUD_SETTLE_WORKERS` | Scale mode: threads that index new traces. `0` uses the main thread. Default: CPUs − 1, at most 4 |
| `--allow-private-webhooks` | `WIZELENS_CLOUD_ALLOW_PRIVATE_WEBHOOKS=1` | off (alert webhooks and uptime checks may not reach private addresses) |
| `--no-osv` | `WIZELENS_CLOUD_OSV=0` | packages checked against OSV |
| `--auth-secret <text>` | `WIZELENS_CLOUD_AUTH_SECRET` | required with Postgres: 32+ characters that sign sessions and encrypt two-step secrets. `2:new,1:old` rotates it |
| `--resend-api-key <key>` | `WIZELENS_CLOUD_RESEND_API_KEY` | none: mail through Resend (`re_…`). Needs `--public-url` |
| `--resend-webhook-secret <s>` | `WIZELENS_CLOUD_RESEND_WEBHOOK_SECRET` | none: the Resend webhook's `whsec_` secret, so bounces and complaints stop later mail. The webhook goes to `<public-url>/_wizelens/api/mail/resend` |
| `--smtp-url <url>` | `WIZELENS_CLOUD_SMTP_URL` | none: mail over SMTP, `smtp://user:pass@host:587` or `smtps://…:465`. Needs `--public-url` |
| `--mail-from <address>` | `WIZELENS_CLOUD_MAIL_FROM` | the sender, such as `WizeLens <a@b.com>` |
| `--mail-reply-to <address>` | `WIZELENS_CLOUD_MAIL_REPLY_TO` | none: where replies go |
| `--trust-proxy` | `WIZELENS_CLOUD_TRUST_PROXY=1` | off: read the client address from the last `X-Forwarded-For` entry (your own proxy only) |
| `--setup-token <text>` | `WIZELENS_CLOUD_SETUP_TOKEN` | random: the first account's token, printed at start while no account exists |
| `--check-pwned-passwords`, `--no-check-pwned-passwords` | `WIZELENS_CLOUD_CHECK_PWNED=1\|0` | on with Postgres, off with PGlite: refuse breached passwords |
| `--sso-origins <list>` | `WIZELENS_CLOUD_SSO_ORIGINS` | none: OIDC provider origins, comma separated, such as `https://acme.okta.com`. SAML needs none |
| `--dns-servers <list>` | `WIZELENS_CLOUD_DNS_SERVERS` | the system's: DNS servers for the single sign-on domain proof, such as `10.0.0.2` or `127.0.0.1:5354`, when the domain is on private DNS |
| `--stripe-secret-key <key>` | `WIZELENS_CLOUD_STRIPE_SECRET_KEY` | none: billing is off and every organization is unlimited. With it (`sk_…` or `rk_…`), plans and limits apply and new organizations start on Free |
| `--stripe-webhook-secret <s>` | `WIZELENS_CLOUD_STRIPE_WEBHOOK_SECRET` | none; required with a Stripe key. The webhook goes to `<public-url>/_wizelens/api/auth/stripe/webhook` |
| `--stripe-prices <json>` | `WIZELENS_CLOUD_STRIPE_PRICES` | none; required with a Stripe key. The price and meter ids `stripe-setup` prints |

To turn billing on, run `wizelens-cloud stripe-setup --stripe-secret-key sk_… --public-url https://lens.example.com`
once. It makes the Team and Business products with monthly and yearly prices, the `wizelens_gb` meter with its
graduated price, and the webhook (with the events `checkout.session.completed` and `customer.subscription.created`,
`.updated`, and `.deleted`), then prints the three options to deploy with. A rerun reuses what exists. Organizations that
existed before billing was turned on stay unlimited until you move them.

Plans charge tax through Stripe Tax: Checkout asks for the billing address and an optional business tax ID, and tax is
added on top of the price. Before the first Checkout, add the head office address in the Stripe Dashboard (Tax >
Settings) and save the customer portal settings once (Settings > Billing > Customer portal). `stripe-setup` says when
Stripe Tax is not active yet. Stripe collects tax only where you add a registration; until then it tracks your sales and
tells you when you pass a threshold.

`wizelens-cloud plan set <org id or slug> <free|team|business|enterprise|unlimited> [--gb N] [--retention-days N]
[--database <url>]` sets a plan by hand, for an Enterprise contract (with its own GB and retention) or for support.
The change goes to the organization's audit log.
