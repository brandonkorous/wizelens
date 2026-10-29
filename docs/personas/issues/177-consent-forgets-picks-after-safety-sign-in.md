# 177 — After the safety sign-in, the app consent screen picks every project again

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 6 (connecting "Larchmont on-call assistant" for Ostrava only)
**Surface:** oauth-consent
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at oauth-consent, 1440 light, 17:10

## What happened

Ifeoma chose "Only these projects" and unchecked Hälsa, then pressed Allow. Her sign-in was older than 15 minutes, so
the screen said "For safety, sign in again first." She did. The consent screen came back with both projects checked.
Pressing Allow, as she had already decided to, would have given the app Hälsa's data too: more than she chose, with
nothing to say her choice was lost.

## Where it lives

`js/packages/ui/src/shell/auth/ConsentScreen.tsx`: the choice lived only in the screen's state, and "Sign in again"
signs out and reloads.

## Fix

"Sign in again" keeps the organization, scope, and projects in this tab (session storage) and the screen reads them
back; Allow or Deny forgets them. The note says "Your choices here are kept." With storage off, the person picks
again, as before.

## Confirmation

- 17:10, Ifeoma: Hälsa off, Ostrava on; Allow; "For safety, sign in again first. Your choices here are kept."; signed in
  with password and code; back on consent with Hälsa off and Ostrava on. She pressed Deny.
