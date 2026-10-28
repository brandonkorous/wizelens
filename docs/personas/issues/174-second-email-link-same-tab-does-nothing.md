# 174 — The second email-change link, opened in the same tab, changes nothing

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 5 (changing the email back; both links pasted from the cloud's log into one tab)
**Surface:** Cloud › verify-email link (and the other emailed links: reset password, invite, delete account)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at verify-email, 1440 light, 16:43

## What happened

On a cloud with no mail service, the middle step says the second link "is in the cloud's log". Ifeoma pasted it into
the same tab. The screen stayed on "One more step", and Profile still showed the old email. The same link in a fresh
tab worked.

## Where it lives

`js/packages/ui/src/shell/auth/LinkScreens.tsx` (`VerifyEmail`) tries its link once per screen (`tried` ref). A new
link in the same tab changes only the address after `#`, so the same screen stays mounted and never tries the new one.
`AuthGate.tsx` mounts the link screens.

## Fix

`AuthGate.tsx` keys `VerifyEmail`, `ResetPassword`, `InviteScreen` and `DeleteAccount` by their token, so a new link
starts a new screen.

## Confirmation

- 16:42, Ifeoma: both links in one tab change the email to `ifeoma.castellanos-lindgren@larchmont-digital.test`.
- 16:43, Ifeoma: both links in one tab change it back to `p06.ifeoma@larchmont-digital.test`.
