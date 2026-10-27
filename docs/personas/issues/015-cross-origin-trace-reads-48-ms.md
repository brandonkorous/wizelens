# 015 — One board load read 17 ms in the list and 48 ms in Compare's list

**Status:** fixed
**Severity:** major
**Found by:** P01 · kanNINJA web team · act 9
**Surface:** Dashboard › Trace › Compare ("Same request, newest"), and every merged cross-origin trace
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 9 — Compare's "Same request" list now shows 21 / 18 / 19 ms, matching the trace list
**Blocked on:** —

## What happened

Traces listed `/api/v1/boards/c2be23b0-… 17 ms`. Dani opened it and pressed Compare. "Same request, newest" listed the
same loads as `2e956243 · 48 ms`, `53858ec0 · 48 ms`, `118eb557 · 52 ms`. Compare itself then said Total 18 ms / 19 ms.
Three numbers for one request. The 48 ms one is wrong: the waterfall put the browser fetch 31 ms after the API had finished.

## Why

kanNINJA's page is on `localhost:3000` and its API on `localhost:3001`: cross-origin, so the browser sends no
`traceparent` (default: same origin only). The API starts its own trace with no parent; the page joins it from
`X-WizeLens-Trace`. The clock rule in `core/src/skew.ts` moves a server span inside "the call that started it" only through
a parent link, so here it did nothing, and the browser and server clocks (31 ms apart) were laid end to end.

## What should have happened

The API span sits inside the fetch that joined its trace, and every screen shows the same length for one request.

## Why it matters

A split front end and API is the normal shape (Next.js + Fastify, SPA + API). Every one of their traces read about 2–3×
too long wherever the merged length is shown, and Dani's compare — the job of act 9 — rested on that number.

## The fix

`core/src/skew.ts`: a root server span with no parent counts as the child of the one root browser call in another
service whose `url.full` path is its `url.path` — the fetch that joined its trace from `X-WizeLens-Trace`. The clock
rule then moves it inside that call. Only the clock: the stored parent links stay as sent. One point, so every merged
trace (dashboard, hub, cloud, MCP) gets it. Test: `skew.test.ts` "moves a server span inside the cross-origin fetch that
joined its trace, with no traceparent". CONTRACT.md "Clocks" says so.

## Confirmed by

> Re-ran P01 act 9: board reloaded twice → `#/traces` → `/api/v1/boards/c2be23b0-… 20 ms` → Open trace → Compare.
> "Same request, newest" now lists `03698c2c · 21 ms`, `dd555955 · 18 ms`, `118eb557 · 19 ms` (was 48–52 ms), and
> Compare says Total 20 ms / 21 ms. Trace `2e956243`, rebuilt from its two halves, now reads 17.3 ms (was 48.2 ms).
> The two 315–321 ms loads in the list are real: there the fetch itself took that long and the API answered in 10 ms.

## Rating effect

In-app › Trace › Compare — Ease 5 → 7
