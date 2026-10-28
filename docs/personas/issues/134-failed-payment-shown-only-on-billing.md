# 134 — The card was declined and WizeLens said so only on the Billing page, without saying how to fix it

**Status:** fixed
**Severity:** major
**Found by:** P05 · Kaweah Valley Credit Union · act 9, the declined card
**Surface:** every page (shell banner); Organization › Billing
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol at 1440 light and 360 dark, 03:10–03:13; P02 Greta 03:13

## What happened

The plan's charge was declined (Stripe's test card 4000 0000 0000 0341; the subscription went past due at 03:09:21).
Marisol opened WizeLens: Overview had no banner, and the cloud sent no mail. Only Organization › Billing said "The last
payment failed; Stripe retries it, and the plan stays until the retries end", which tells her what failed and what still
works but not what to do. In the Stripe portal, making a good card the default does not charge it: she must also press
"Pay failed amount".

## The fix

- `ui/src/shell/UsageBanner.tsx`: for owners and admins, while the plan is past due, every page shows "The last payment for
  the Business plan failed. Everything keeps working while Stripe tries again. Update the card" (a link to Billing).
  Members and viewers do not see it.
- `ui/src/pages/organization/BillingSection.tsx`: "…To fix it, choose Manage billing, add or pick a card that works, then
  press Pay failed amount."
- Mail: not added. Stripe sends its own failed-payment emails in live mode when that Stripe setting is on; noted here so it
  is a choice, not an absence.

## Confirmation

- 03:10, Marisol: Overview shows the banner (1440 light; 360 dark, readable, link reachable by thumb). Hannah (viewer): none.
- 03:11–03:12, Marisol: Update the card → Billing (the line above) → Manage billing → portal "Payment failed … Update payment
  method" → makes •••• 4242 the default → "Pay failed amount" → picks •••• 4242 → Continue. The portal shows the plan healthy.
- 03:13: the banner is gone and Billing's head is back to normal (webhooks `customer.subscription.updated` answered 200).
- Rule 7, 03:13, P02 Greta: no banner.
- Test setup, not product: a test clock cannot be added to an existing Stripe customer, so the renewal was stood in for by a
  $99.19 charge on the plan subscription (quantity 2, billed at once), set back to 1 afterwards without a charge.
