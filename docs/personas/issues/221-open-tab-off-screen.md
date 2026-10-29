# 221 — On a phone the open settings tab is off the screen

**Status:** fixed
**Severity:** ease
**Found by:** P03, Organization › General
**Surface:** `#/organization/general`, every section page and trace tabs
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid at 360: Billing, Tags and Projects each open with their tab in view (scrollLeft 528, 432, 0); trace Timeline, SQL and Logs too; the left arrow still moves the row and it stays put

## What happened

The tab row showed "…d hidden keys · Tags · Billi" on the General page. The open tab was past the right edge.

## Where it lives

`useScrollRow` in `ui/src/ui/ScrollRow.tsx`. It centered the open tab once, before counts and icons set each tab's final width.

## Fix

The row centers the open tab again when any tab changes size, until the person scrolls, swipes or taps an arrow.
