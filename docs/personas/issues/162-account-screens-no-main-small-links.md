# 162 — Account screens: no main region, and the small links are hard to tap

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 4 (sign in, sign-up, forgot and reset password, two-factor, at 360; axe)
**Surface:** Cloud › every signed-out screen
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 and 360, 15:52

## What happened

axe `landmark-one-main` and `region` on all 11 account screens: the card is not in a main region, so a screen reader
cannot jump to the form. At 360 with touch, "Forgot password?", "Create an account", "I have an account", "Back to
sign in", "Send a new link" and "Use a backup code instead" were under 32 px high: a thumb hits the wrong one.

## Where it lives

`js/packages/ui/src/shell/auth/AuthForm.tsx` and `AuthGate.tsx` (the `wl-auth` wrapper is a `div`);
`styles/touch.css` sized table links only.

## Fix

The wrapper is `<main>`. On touch screens the links and link buttons in the account card are 44 px high.

## Confirmation

- 15:52, Ifeoma: axe finds no landmark or region problem on the 11 account screens; at 360 touch every link and link button is 44 px high.
