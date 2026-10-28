# 136 — "Switch to Team" said only "HTTP 400", and never said what she would lose

**Status:** fixed
**Severity:** major
**Found by:** P05 · Kaweah Valley Credit Union · act 10, deciding on the plan
**Surface:** Organization › Billing › Plans; `wizelens-cloud stripe-setup`
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol at 1440 light and 360 dark touch, 03:30–03:31

## What happened

With the temps gone, Marisol checked whether Team would do. She pressed **Switch to Team**. Nothing asked her first, and a
red box said "HTTP 400". Two defects behind one box:

1. **No plan switch could work.** Stripe refused: "the subscription update feature in the portal configuration is
   disabled". `stripe-setup` made products, prices and the webhook but never set up the customer portal, and the docs
   told the operator to "save the portal settings once", which leaves plan switches off.
2. **Every Better Auth refusal read "HTTP 400".** The UI read only `error`; Better Auth answers `message`.
3. Had it worked, the button would have gone straight to Stripe, whose page shows only the new price. Nothing said that Team
   keeps 30 days of data (60 days of traces and logs deleted), stops audit export and SCIM, and locks single sign-on.

## The fix

- `cloud/src/billing/stripe-portal.ts` (new), called by `stripe-setup`: sets the default portal to switch between the Team
  and Business prices (with prorations), cancel at the period end, and update card, address, tax ID; a rerun changes nothing.
  Test in `billing-jobs.test.ts`. Ran on the test account: "Made: billing portal settings."
- `ui/src/data/api.ts`: an error shows `error`, else `message`, else the status.
- `ui/src/pages/organization/BillingPlans.tsx` `lossOf`: a move to a plan with fewer days or features asks "Move to Team?" and
  lists what stops, then "Stripe shows the new price next." Moving up asks nothing.
- Docs: `site/content/docs/cloud.md`, `docs/CONTRACT.md`.

## Confirmation

- 03:30, Marisol: Switch to Team → "Move to Team? Data is kept 30 days, not 90: older traces and logs are deleted. Single
  sign-on settings lock: people sign in with it as now, but you cannot change it or require it. SCIM provisioning stops.
  Audit log export stops; the log itself stays. Stripe shows the new price next." Cancel → still Business. Same at 360, dark,
  touch: the list wraps and both buttons fit.
- 03:31, Continue to Team → Stripe "Confirm your updates · WizeLens Team · $29.00 monthly starting November 28, 2026 · Visa
  •••• 4242". She left without confirming: still Business, no webhook. She keeps Business: SSO and the examiner's export need it.
- Rule 7: Greta's org is on Unlimited (no Plans panel); the error-text change is shared and showed Stripe's own sentence here.
