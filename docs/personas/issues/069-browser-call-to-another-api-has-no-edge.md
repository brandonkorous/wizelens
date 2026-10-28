# 069 — The Services map has no line from the web app to an API on another origin

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 11
**Surface:** Services › Dependencies, and a service's "Calls" / "Called by" (cloud and in-app)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 11 · cloud Services
**Blocked on:** —

## What happened

The Blazor admin (served by Web on :5001) saves through PublicApi on :5099. The cloud trace `b1b8202b…` shows the
browser fetch with PublicApi's PUT under it. But Services had no Web App → PublicApi line, and Web App's "Calls"
listed only Web. With no caller, PublicApi sat in the first column, so its line to the catalog database ran under the
Web box and its label crossed that line.

## What should have happened

The map shows who calls whom: Web App → PublicApi, as the trace does.

## How to reproduce

1. A page calls an API on another origin (no `traceparent` goes cross-origin by default). Open Services.

## Why it matters

Every split front end / API (SPA + API, Blazor WebAssembly + API) lost its main line on the map.

## Where it lives

`edgeCallsOf` (`core/src/stats/services.ts`) finds a fetch's server by the server span's parent id. Cross-origin, the
server span has no parent: the page joins the server's trace from X-WizeLens-Trace. The trace screen already nests
it by path (`adoptedBy` in `core/src/skew.ts`); the edges did not use that rule.

## The fix

`adoptedBy` is exported and `edgeCallsOf` uses it, so the map and the trace screen share one rule. FACTS_VERSION 15,
so stored traces are counted again. Test: `core/src/stats/service-edges.test.ts`.

## Confirmed by

2026-10-27 19:50, P03 saved product 1 twice in the admin. Cloud Services (cloud restarted on the new build, facts
rebuilt): Dependencies reads Web App → PublicApi "18 · p95 1.12 s" and Web App → Web "8 · p95 59 ms"; PublicApi
moved into the Web column, and no line runs under a box. Web App's panel: Calls "PublicApi 18 calls · 375 ms",
"Web 8 calls · 42 ms".
