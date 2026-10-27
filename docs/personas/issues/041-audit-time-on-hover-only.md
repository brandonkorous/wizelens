# 041 — On my phone the audit log only says "3m ago"

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 9 (standing check: without a mouse)
**Surface:** Cloud › People & access › Audit log
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 9 at 360px — Audit log When column reads "Oct 27, 2026, 3:24 AM" with "1m ago" under it, no hover needed (Cloud › People & access › Audit log)
**Blocked on:** —

## What Greta saw

The When column read "24s ago", "3m ago". The date and time ("Oct 27, 2026, 3:24 AM") showed only when the mouse
rested on it. On a phone, or tomorrow, she could not say when a change was made, and the time is the point of an
audit log.

## Where it lives

`ui/src/pages/people/AuditLog.tsx`: the When cell put the full time in a `title`.

## Fix

The cell shows the date and time, with "3m ago" small under it.
