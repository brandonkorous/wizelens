# WizeLens — Cloud Billing Plan

Decided 2026-10-19. Only the hosted cloud is paid. The add-ons, the hub, and a self-hosted cloud stay free and
unlimited: billing is off unless the cloud starts with Stripe keys. Research behind it: the "WizeLens Cloud Pricing and
Competitor Research" doc.

## Plans

| Plan | Price per month | Data included | Retention (max) | Adds |
|---|---|---|---|---|
| Free | $0 | 10 GB | 14 days | Unlimited users, alerts, MCP, share links |
| Team | $29 | 50 GB | 30 days | Overage instead of a hard stop |
| Business | $99 | 150 GB | 90 days | SAML and OIDC SSO, SCIM, audit log export |
| Enterprise | Custom | Custom | Up to 400 days | Set by us: data residency, SLA, BAA |

- **Extra data** on Team and Business, counted above the plan's included GB each month: the first 500 GB at $0.30,
  the next 1,500 GB at $0.20, the rest at $0.10 (graduated).
- **Annual** billing: 10 months' price for 12. Plan prices are a first version; they live in one file.
- **Never** a seat fee or an MCP fee.
- **A GB** is the size of the request body the cloud accepts on ingest and OTLP, before compression is undone.

## Status

| Phase | What | Size | State |
|---|---|---|---|
| B1 | Plans, the billing switch, and the plan per organization | S | Done |
| B2 | Usage metering | M | Done |
| B3 | Limits: Free cap, retention by plan, feature gates, spend cap | M | Done |
| B4 | Stripe: checkout, portal, webhooks, metered overage, setup command | L | Done |
| B5 | Billing page and plan prompts in the dashboard | M | Done |
| B6 | Pricing page on wizelens.com, docs, deploy notes | M | Not started |

## Rules

- Billing off (no `--stripe-secret-key`) means every organization is `unlimited`: no caps, no prompts, no billing UI.
  Self-hosters never see a plan.
- Stripe goes through Better Auth's Stripe plugin (`@better-auth/stripe`, the organization as the subscription
  reference) and SCIM through `@better-auth/scim`. Never a hand-rolled checkout or auth flow.
- Plan changes, cap changes, and blocked ingest go to the audit log.
- New tables are new migrations; never edit a shipped one.

## B1 — Plans and the switch

- `cloud/src/billing/plans.ts`: `PLANS` with price, included GB, max retention, and features per plan; overage tiers.
- Options: `--stripe-secret-key`, `--stripe-webhook-secret`, and the price and meter ids (`--stripe-prices`, JSON).
- `orgs.plan` (`unlimited` when billing is off, `free` for new organizations when on), plus custom limits for
  Enterprise (`plan_gb`, `plan_retention_days`).
- `wizelens-cloud plan set <org> <plan> [--gb N] [--retention-days N]` for Enterprise and support.

## B2 — Usage metering

- Count accepted ingest bytes, spans, logs, and metric points per organization per UTC day (`usage_daily`).
- Counters live in memory and flush every minute and at shutdown; a crash loses at most a minute.
- `GET api/orgs/:org/usage`: this month's GB, the daily series, the plan's included GB, the overage so far in
  dollars, and a month-end projection.

## B3 — Limits

- **Free cap:** at 10 GB in a month, ingest answers 429 "This organization reached the Free plan's 10 GB for this
  month" until the 1st or an upgrade. Add-ons and OTLP exporters already back off on 429.
- **Mail** to owners and admins at 80% and 100% of the included GB (once per month each), through the mailer.
- **Retention by plan:** the retention setting is capped by the plan; a downgrade lowers it to the new maximum.
- **Gates:** SSO provider setup and SCIM need Business or Enterprise; audit log export needs Business. A gated
  call answers 402 with the plan it needs.
- **Spend cap** (optional, Team and Business): owners set a monthly overage limit in dollars; past it, ingest
  answers 429 like the Free cap.

## B4 — Stripe

- Products and prices: Team and Business, monthly and annual; one Billing Meter `wizelens_gb`; one graduated metered
  price on that meter, added to every paid subscription.
- Checkout and the customer portal through the plugin; webhooks set `orgs.plan` on start, change, and cancel. A
  failed payment keeps the plan for the Stripe retry period, then drops to Free.
- A daily job reports each paid organization's GB above its included GB as meter events, one per org and day, with
  an idempotency identifier, so a rerun never bills twice.
- `wizelens-cloud stripe-setup --stripe-secret-key sk_...` creates the products, prices, and meter and prints the
  options to deploy with.
- **Tax:** Stripe Tax on Checkout and the usage subscription (`automatic_tax`), billing address required, business tax
  IDs collected. Products carry the business SaaS tax code `txcd_10103001`; prices are tax-exclusive. Subscriptions use
  flexible billing mode. Registrations are added in the Dashboard as thresholds are reached.

## B5 — Dashboard

- **Billing page** (owners and admins, cloud only): plan, usage bar against included GB, projection, overage so far,
  upgrade and downgrade, "Manage billing" (Stripe portal: cards, invoices, cancel), and the spend cap.
- **Banner** at 80% and 100% on Free, and when a spend cap stops ingest.
- **Gated features** (SSO, SCIM, audit export) show the plan they need and an upgrade button, not an error.

## B6 — Site, docs, deploy

- **Pricing page** at `/pricing` on wizelens.com: the four plans, the overage tiers, a GB slider that shows the
  monthly price, "free forever to self-host", an FAQ, and the total-cost comparison with Datadog and Dynatrace.
  Follows the site's style rules. Linked from the nav and the cloud page.
- **Docs:** "Plans and billing" in `site/content/docs/cloud.md`; the new options; CONTRACT tables; CHANGELOG.
- **Deploy notes:** the Stripe secrets and webhook URL to add in sparx.works.
