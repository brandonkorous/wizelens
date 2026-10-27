# 035 — I opened the alert link from my email, signed in, and lost the alert

**Status:** fixed
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 7 (standing check: deep link while signed out)
**Surface:** Cloud › sign-in › Two-step sign-in
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 7 — signed out, opened the email's "Open the alert" link, signed in with email, password and the phone code: landed on `#/alerts/0562113a-…?project=fb8ecf9e-…` with "API error rate > 2% (5 min) — page Greta · Firing" and its notices on screen (Cloud › Alerts › one rule)
**Blocked on:** —

## What Greta saw

The alert email's "Open the alert" link (`#/alerts/0562113a-…?project=fb8ecf9e-…`) opened the sign-in
screen, as it should when signed out. She typed her email and password, then the code from her phone. She
landed on Overview. The alert she was paged about was gone, and at 3 AM she had to find it again from the
menu. Without two-step sign-in the same link comes back to the alert, so the people who turned on the
safer setting got the worse result.

## Where it lives

Password sign-in draws the sign-in form over the page that was asked for, so the address stays. Two-step
sign-in moves to `#/two-factor`, which replaces the address, and `afterSignIn` (`shell/auth/flow.ts`)
then goes to the overview.

## Fix

- `routes.ts` `toTwoFactor()`: before opening `#/two-factor`, keep the page that was asked for in this
  tab's session storage (as the OAuth step already does); `takeSignInBack()` reads it once.
- Both ways into two-step sign-in use it (`AuthScreen` sign-in and the auth client's two-factor redirect).
- `afterSignIn`: an app's authorization, then a pending invite, then the kept page, then the overview.
