# 125 — Buying Business left the organization keeping 14 days, not the 90 the plan includes

**Status:** fixed
**Severity:** defect
**Found by:** P05 · Kaweah Valley Credit Union · act 3, after buying Business
**Surface:** Organization › Billing (buy), Data retention, the top bar "Cloud · kept N days"
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol, new org "KVCU — Vendor Sandbox" bought Team at 1440, 02:04

## What happened

Marisol paid $99 for Business, which the plan card sells as "150 GB a month · 90 days of data". Afterwards the
top bar still read "Cloud · kept 14 days" and Data retention still held 14: the Free plan's most. Nothing said
she had to raise it herself. A credit union buying 90 days for exam evidence would have lost 76 of them.

## Why

`setPlan` (repo/billing.ts) only ever lowered `retention_days` to the new plan's most (for a downgrade). It never
raised it on an upgrade.

## The fix

`setPlan`: an organization that kept the old plan's most gets the new plan's most; a shorter choice stays as it
is, and a downgrade still lowers it. Test: billing.test.ts "gives the new plan's days on upgrade…".

## Confirmation

- 02:04, Marisol at 1440: a new org "KVCU — Vendor Sandbox", Choose Team, paid with 4242 on Stripe Checkout,
  back on WizeLens: top bar "Cloud · kept 30 days"; Data retention "Days 1 to 30 on the Team plan".
- Her credit union org was bought before the fix; she set it to 90 on Data retention (top bar "kept 90 days").
- Rule 7 (P02): not applicable. Greta's org is on Unlimited, with no plan change.
