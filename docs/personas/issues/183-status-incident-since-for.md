# 183 — A past incident on the status page says "was down since …, for 1 min"

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 7 (the public page "Hälsa Clinics — booking status", opened signed out)
**Surface:** Public status page
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at the public status page, signed out, 1440 light, 17:22

## What happened

Under Past Incidents: "Hälsa booking API — clinic stock was down since Oct 28, 2026, 5:19 PM, for 1 min". "Since"
says it is still down; the clinic's patients read this page.

## Where it lives

`js/packages/ui/src/pages/status/StatusPage.tsx`, the incident line.

## Fix

An open incident says "is down since …"; a past one says "was down for 1 min, from …".

## Confirmation

- 17:22, signed out: "Hälsa booking API — clinic stock was down for 1 min, from Oct 28, 2026, 5:19 PM".
