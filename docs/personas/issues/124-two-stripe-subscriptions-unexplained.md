# 124 — Stripe's billing page lists two subscriptions with two Cancel buttons, and WizeLens never says why

**Status:** fixed
**Severity:** design
**Found by:** P05 · Kaweah Valley Credit Union · act 2, after buying Business
**Surface:** Organization › Billing, "Manage billing" (Stripe's customer portal)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol Billing at 1440, 01:42

## What happened

Marisol, who signs the invoices, opened Manage billing and found "WizeLens extra data — next billing date
November 1" and "WizeLens Business $99.00 per month — next billing date November 28", each with its own "Cancel
subscription". Nothing in WizeLens said there would be two, why their dates differ, or which one ends the plan.
(Canceling extra data alone is safe: the cloud starts it again while the plan runs.)

## What should have happened

Before she leaves for Stripe, the Billing page says what she will see there and how to stop paying.

## The fix

`ui/src/pages/organization/BillingSection.tsx`: on a paid plan, a note under the heading: Stripe lists two
subscriptions, the plan and extra data billed on the 1st for GB above the included GB; to stop paying, Move to Free;
extra data alone cannot be canceled while the plan runs.

## Confirmation

- 01:42, Marisol at 1440: "Manage billing opens Stripe for your card, address, and invoices. Stripe lists two
  subscriptions: the Business plan, and extra data, billed on the 1st for any GB above the 150 GB included. To stop
  paying, use Move to Free below; extra data alone cannot be canceled while the plan runs."
