# 097 — Requests, Database, and Services are blank for a site with no server

**Status:** fixed
**Severity:** minor
**Found by:** P04 · Haddad Studio · act 7
**Surface:** Requests, Database, Services (Overview already had it)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 7 at 22:36 on her phone (390, last 15 min, 3 page views): Overview, Requests, Database, and Services each open with "3 page views arrived, and no …", what sends that data, "To add one: Setup steps", and the Rendering link. Traces lists her page loads and Logs her browser errors, so they need no line.

## What happened

Noor has only the script tag. Overview said why its numbers were empty ("3 page views arrived, and no server
requests…"). Requests, Database, and Services showed only "No data" cards and "No requests in this range" / "No
queries in this time range" / "No services yet". On those screens she could not tell "my site is broken" from "this
screen is for apps with a server".

## What should have happened

Each server screen says what arrived, what it is missing and why, and where her data is.

## Where it lives

The page-view count lived only in the Overview model and its banner was in `OverviewPage.tsx`.

## The fix

`core/src/models/input.ts`: every model's `meta` has `pageViews`. `ui/src/ui/PagesOnly.tsx` is the one banner, with
one sentence per screen; Overview, Requests (no filter set), Database, and Services show it when they have nothing of
their own. On the cloud it links the setup steps.
