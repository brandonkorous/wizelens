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

## What the cloud adds

Everything the local dashboard does, plus:

- **Teams:** organizations, roles, single sign-on, SCIM, and an audit log. See [Teams and access](/docs/teams/).
- **History:** pages come from stats tables, never a sample, so 7- and 30-day pages answer in under a second. Traces are
  kept 30 days by default (1 to 400); see [Data retention](/docs/teams/#project-settings).
- **Alerts** to Slack, Teams, Discord, PagerDuty, webhooks, and email, with reminders and an "above normal" mode. See [Alerts](/docs/alerts/).
- **Uptime checks** and public status pages. See [Uptime checks](/docs/uptime/).
- **Errors** you can assign, resolve, and ignore, and [tags](/docs/tags/) shared by the team. See [Errors](/docs/errors/).
- **Security** risks and vulnerable packages, checked against OSV. See [Security](/docs/security/).
- **Hosts and Kubernetes** from the OpenTelemetry Collector. See [Hosts and Kubernetes](/docs/kubernetes/).
- **Plans** on the hosted cloud; a self-hosted cloud has no limits. See [Plans and billing](/docs/plans/).

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

To turn billing on in a self-hosted cloud, see [Plans and billing](/docs/plans/#turn-billing-on).
