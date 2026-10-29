---
title: Plans and billing
description: The hosted cloud's plans, what counts as a GB, the Free limit, spend caps, and how to turn billing on when you self-host.
---

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

## Turn billing on

To turn billing on, run `wizelens-cloud stripe-setup --stripe-secret-key sk_… --public-url https://lens.example.com`
once. It makes the Team and Business products with monthly and yearly prices, the `wizelens_gb` meter with its
graduated price, and the webhook (with the events `checkout.session.completed` and `customer.subscription.created`,
`.updated`, and `.deleted`), and sets the Stripe customer portal so people can switch between Team and Business,
cancel at the period end, and change their card and address. Then it prints the three options to deploy with. A rerun
reuses what exists. Organizations that
existed before billing was turned on stay unlimited until you move them.

Plans charge tax through Stripe Tax: Checkout asks for the billing address and an optional business tax ID, and tax is
added on top of the price. Before the first Checkout, add the head office address in the Stripe Dashboard (Tax >
Settings). `stripe-setup` says when
Stripe Tax is not active yet. Stripe collects tax only where you add a registration; until then it tracks your sales and
tells you when you pass a threshold.

`wizelens-cloud plan set <org id or slug> <free|team|business|enterprise|unlimited> [--gb N] [--retention-days N]
[--database <url>]` sets a plan by hand, for an Enterprise contract (with its own GB and retention) or for support.
The change goes to the organization's audit log.
