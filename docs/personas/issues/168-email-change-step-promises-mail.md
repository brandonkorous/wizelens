# 168 — Changing the email: "open the link we sent to your new email" when none was sent

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 5 (Profile › Email › Change, then the first link)
**Surface:** Cloud › verify-email, the step between the two links of an email change
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 light, 16:23

## What happened

An email change takes two links: one to the old email, then one to the new. On a cloud with no mail service, the
first link opened "One more step — Now open the link we sent to your new email." Nothing was sent: the second link
was in the cloud's log. The neighbour of #163, on the same screen, left behind by that fix.

## Where it lives

`js/packages/ui/src/shell/auth/LinkScreens.tsx` › `VerifyEmail`, the "changing" card.

## Fix

The card reads the cloud's `mail` flag, as #163's card does: with no mail it says the second link is in the cloud's log.

## Confirmation

- 16:23, Ifeoma: a change of email, first link from the log, reads "One more step — Now open the second link, for
  your new email. This cloud cannot send email: ask the person who runs it, the link is in the cloud's log. It finishes
  the change."; the second link from the log finishes it.
