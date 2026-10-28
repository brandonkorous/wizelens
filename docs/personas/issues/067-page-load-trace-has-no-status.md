# 067 — My 500 page's trace title has no "500"

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 8
**Surface:** Trace detail header, Traces list (every stack)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 8 · Trace detail, Traces
**Blocked on:** —

## What happened

Once the HUD was on eShop's error page (#066), the basket crash's trace (`fa549f27…`) is titled `pageview /Basket`
with no status pill; the earlier trace of the same crash, without the browser's page view, read
`GET /Basket/{handler?}` **500**. The red dot and the error row are there, but the number Sid scans for is gone.

## What should have happened

A page load's trace shows the page's HTTP status, as its Requests row does.

## How to reproduce

1. Any server page with the HUD (so the browser sends its page view). Open its trace: no status pill.

## Why it matters

A 500 that reads like a page view is easy to pass over in a list of traces.

## Where it lives

`buildTrace` (`core/trace.ts`) and `.NET Storage/TraceBuilder.cs` take `rootStatusCode` from the root span only; a
page load's root is the browser's page view, which has no status.

## The fix

`buildTrace` (`core/trace.ts`) and `TraceBuilder.Build` (.NET): `rootStatusCode` is the root's, else the entry
server span's. One rule, both builders, so the header, the Traces list, and health all get it. Tests:
`trace-status.test.ts`, `PageLoadTimingTests` (root `pageview /Basket`, status 200).

## Confirmed by

2026-10-27 19:31, P03 Sid: trace `4f60de04…` title reads `pageview /Basket` **500**; Traces → Trace Timeline reads
`/Basket` **500** · 296 ms · 5 spans.
