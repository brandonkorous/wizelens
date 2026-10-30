# @wizeworks/lens-cloud

The cloud service of [WizeLens](https://github.com/wizeworksllc/wizelens): the full dashboard for many teams, with accounts,
projects, 30 days of history computed on the server, alerts, share links, and AI access through read keys.

```bash
# Try it on your machine (Postgres in-process, data in ./.wizelens-cloud)
npx @wizeworks/lens-cloud

# For a team: Postgres in Docker
POSTGRES_PASSWORD=<a long secret> docker compose -f deploy/docker-compose.cloud.yml up -d
```

The cloud prints a one-time setup link while it has no account. Open it and create the first account. Make an ingest key under
Connect, Setup steps, then on each app:

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
| `--auth-secret <text>` | `WIZELENS_CLOUD_AUTH_SECRET` | required with Postgres (32+ random characters; `2:new,1:old` rotates) |
| `--resend-api-key <key>` | `WIZELENS_CLOUD_RESEND_API_KEY` | none: mail through the [Resend](https://resend.com) API (`re_…`) |
| `--resend-webhook-secret <s>` | `WIZELENS_CLOUD_RESEND_WEBHOOK_SECRET` | none: the `whsec_…` secret of the Resend webhook (see below) |
| `--smtp-url <url>` | `WIZELENS_CLOUD_SMTP_URL` | none: or mail over SMTP (`smtp://user:pass@host:587` or `smtps://…:465`) |
| `--mail-from <address>` | `WIZELENS_CLOUD_MAIL_FROM` | `WizeLens <no-reply@<public host>>` |
| `--mail-reply-to <address>` | `WIZELENS_CLOUD_MAIL_REPLY_TO` | none: replies go to the sender |
| `--trust-proxy` | `WIZELENS_CLOUD_TRUST_PROXY=1` | off (client address from the last `X-Forwarded-For` entry) |
| `--setup-token <text>` | `WIZELENS_CLOUD_SETUP_TOKEN` | random, printed at start while no account exists |
| `--[no-]check-pwned-passwords` | `WIZELENS_CLOUD_CHECK_PWNED=1\|0` | on with Postgres, off with PGlite |
| `--sso-origins <list>` | `WIZELENS_CLOUD_SSO_ORIGINS` | none: identity provider origins for OIDC single sign-on, comma separated (`https://acme.okta.com`) |
| `--stripe-secret-key <key>` | `WIZELENS_CLOUD_STRIPE_SECRET_KEY` | none: billing off, every organization unlimited. With it: plans, limits, and the Billing page |
| `--stripe-webhook-secret <s>` | `WIZELENS_CLOUD_STRIPE_WEBHOOK_SECRET` | none; required with a Stripe key (webhook: `<public-url>/_wizelens/api/auth/stripe/webhook`) |
| `--stripe-prices <json>` | `WIZELENS_CLOUD_STRIPE_PRICES` | none; required with a Stripe key: what `wizelens-cloud stripe-setup` prints |

Put it behind https, and set `--public-url` to the https address: cookies are then Secure, and passkeys and email links use it.
Sending mail needs `--public-url`. Without `--resend-api-key` or `--smtp-url`, nobody gets email: reset and invite links are in
the log, and email addresses are not confirmed. PGlite is for trials and tests; use Postgres for real teams.

## Email

Use Resend or SMTP, not both. With Resend, each email is sent with an idempotency key and tried up to 4 times on 429 and 5xx answers.
Add a Resend webhook to `<public-url>/_wizelens/api/mail/resend` with the events `email.bounced` and `email.complained`, and set
`--resend-webhook-secret` to its signing secret. The cloud checks the signature, then keeps a suppression list: after a hard bounce
no mail goes to that address, and after a spam complaint only mail the person asked for (confirm, reset, change, delete) goes
there. Confirming the address again by link clears it.

What the cloud sends, beyond sign-in links and invites:

- **Security notices**, always, to the person: password changed, email changed (to the old address), two-step sign-in on or off,
  passkey added or removed, new backup codes, and a sign-in on a browser and system the account never used.
- **Team changes**, to owners and admins: members invited, joined, left, removed, or given a new role (that member hears too), keys,
  single sign-on, projects, share links, and settings. One email per batch, without the reader's own changes. A deleted
  organization is told to every member.
- **Project health**, to owners and admins: a project that sends data in most hours went quiet for 2 hours, and when it is back.
- **Alerts**, from alert rules.
- **Digests**, per person and project: daily, weekly (Mondays), and monthly (the 1st), at the person's hour and time zone. Weekly
  is on by default. Each has requests, error rate, average and p95 time, SQL queries, alerts fired, top errors, the slowest
  endpoints, and insights. Projects with no traffic get none.

Team, health, and digest emails carry a one-click stop link (`List-Unsubscribe`, RFC 8058). People pick all of it on the Account
page. `pnpm --filter @wizeworks/lens-cloud email:preview <folder>` writes every email to HTML and text.

## Accounts

Sign-in is [Better Auth](https://better-auth.com) (pinned to one version): email and password, passkeys, two-step codes from an
authenticator app with backup codes, password reset and email confirm by link, sessions per device (sign out one or all),
organizations with owner, admin, member, and viewer roles, email invites, single sign-on per organization (OIDC or SAML, after a
DNS proof of the email domain; People & access page), and account deletion. Sign-in tries are limited per
client address across all instances. Existing accounts keep working after the upgrade; everyone signs in once more. See
`docs/CONTRACT.md`, "Tenancy and access".

Check a running cloud end to end with `node scripts/cloud-smoke.mjs <url> <setup token>` from the repo (a fresh database, no SMTP).

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

const cloud = await createCloud({
  database: process.env.DATABASE_URL,
  publicUrl: "https://wizelens.example.com",
  authSecret: process.env.WIZELENS_CLOUD_AUTH_SECRET,
  resendApiKey: process.env.WIZELENS_CLOUD_RESEND_API_KEY,
  resendWebhookSecret: process.env.WIZELENS_CLOUD_RESEND_WEBHOOK_SECRET,
});
console.log(await cloud.listen());
```

The API, roles, keys, and storage are in [CONTRACT.md](https://github.com/wizeworksllc/wizelens/blob/main/docs/CONTRACT.md#cloud-v07-phase-3). MIT licensed.
