# 176 — The app consent screen and the privacy page send people to "Account, Connected apps", which does not exist

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 6 (connecting the MCP client "Larchmont on-call assistant")
**Surface:** oauth-consent; site Privacy page
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at oauth-consent, 1440 light, 16:50

## What happened

The consent screen said "It keeps access until you remove it under Account, Connected apps." The Account page has no
such tab: it is "My apps". "Connected apps" is the admins' list under People & access. The docs already said
**Account → My apps**; the privacy page said "Account → Connected apps".

## Where it lives

`js/packages/ui/src/shell/auth/ConsentScreen.tsx` (`WhatItGets`), `site/content/legal/privacy.md`.

## Fix

Both say "Account → My apps", as the docs do. The privacy page's date is October 28, 2026.

## Confirmation

- 16:50, Ifeoma: the consent screen reads "It keeps access until you remove it under Account → My apps." The site
  check runs before the PR.
