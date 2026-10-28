# 085 — Page views arrive, and the Overview says nothing has

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 4
**Surface:** Cloud › Overview
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P04 · act 4 on a 390 px phone; RULE #7 on P02 Greta's Overview
**Blocked on:** —

## What happened

With the browser key in her tag, Noor visited 29 pages at three sizes. Rendering lists 13 pages with views. The
Overview, the first screen she sees, says "Nothing has arrived in this range. New here? Make a key and add it to your
site or service", with Total Requests 0, Avg Duration –, SQL Queries 0 and Apdex –. The first sentence is false, and it
sends her back to make another key. (The banner came with #082; the zeros were there before it.)

## What should have happened

The Overview knows page views arrived. It says this project has page data from a site and no server requests, that
the request, SQL and Apdex numbers need a WizeLens server SDK, and where her page views are.

## Where it lives

`js/packages/core/src/models/overview.ts`: `empty` means "no server requests", and the model has no page-view count,
so `js/packages/ui/src/pages/overview/OverviewPage.tsx` cannot tell a new project from a site with no server.

## The fix

The Overview model counts page views in the range (`pageViews`, from the same `pv` rollup Rendering uses). With no
requests and some page views, the Overview says "N page views arrived, and no server requests. Request, SQL, and Apdex
numbers need a WizeLens server SDK. See your pages and their load times under Rendering." with a link; with neither,
the #082 banner as before.

## Confirmed by

2026-10-27, by 21:30, as Noor on a 390 px phone, last hour: "29 page views arrived, and no server requests. …" (29 =
12 phone + 8 tablet + 8 desktop + 1 contact page, as visited). RULE #7: Greta's Overview (7 days, 611 requests) shows
no banner. Core model tests: 65 passed.
