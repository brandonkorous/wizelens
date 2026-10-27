# 004 — The HUD's link for the card move opened only the API half; the browser half was on another dashboard

**Status:** fixed
**Severity:** major
**Found by:** P01 · kanNINJA web team · act 5
**Surface:** HUD › details panel (call links) · the dashboards' trace page
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 5 — dragged card 1 to In the shop, clicked the move in the HUD; the trace opened on :3000 with browser + kanninja-backend, 9 spans
**Blocked on:** —

## What happened

Dani dragged `Müller — template the 3.2 m island worktop (oak, 40 mm)` from
**Measured** to **In the shop**, opened the HUD details and clicked
`POST /api/v1/… /move · 7 SQL`. The new tab opened the API's dashboard:

> POST /api/v1/boards/:boardId/cards/:cardId/move · TOTAL 8.1 ms · SPANS 8 · SERVICES kanninja-backend

No browser fetch, no network time. The same trace id on the web app's own
dashboard (`http://localhost:3000/_wizelens/#/traces/0013bf08…`) held all of it:

> fetch /api/v1/boards/…/move · TOTAL 83 ms · SPANS 9 · SERVICES browser kanninja-backend · Network and other 32 ms

## What should have happened

The HUD link opens the trace where all of it can be read: the browser fetch with
the API request and its SQL inside.

## How to reproduce

1. On a Next.js page whose API is on another origin (kanNINJA: web 3000, API 3001), make any call.
2. Open the HUD details and click the call.

## Why it matters

"One click, one trace" is the promise. Dani had no way to know a second dashboard
held the other 75 ms of the click, and the 8 ms they saw made the move look free.

## Where it lives

`js/packages/browser/src/recorder.ts` — `traceLink` uses `data.endpointOf(id)`, the
server that answered (3001). `sender.ts` sends the browser spans of a trace owned
by another origin to the page's own endpoint (3000), and only that endpoint
federates downstream (`node/src/federation.ts` follows `remotes`), so the link and
the spans disagree.

## The fix

One rule, `spanHome` in `browser/src/sender.ts`: a trace's browser spans go to its owner when the owner is on
this page's origin, else to the page's own endpoint. The sender and `recorder.traceLink` both use it now, so the
link always opens where the browser half is, and that endpoint federates down to the API. Side effect: an
`X-WizeLens-Endpoint` header naming another origin can no longer point the HUD's links there. Test:
`remote-server.test.ts` "sends spans of a trace on another origin to the configured endpoint" now also checks
the link. Siblings: `dashboardLink` (`hud/parts.ts`) and the card's links go through `traceLink`.

## Confirmed by

> Re-ran P01 act 5: closed the HUD details, dragged `Müller — template the 3.2 m island worktop (oak, 40 mm)`
> from Measured to In the shop, opened the details, clicked `POST /api/v1/… /move · 7 SQL`. It opened
> `http://localhost:3000/_wizelens/#/traces/d75088eb…`: `fetch /api/v1/boards/…/move` · TOTAL 70 ms · SPANS 9 ·
> SERVICES browser kanninja-backend, with `IN POST /api/v1/boards/:boardId/cards/:cardId/move 8.3 ms` and its 7 SQL inside.

## Rating effect

HUD › details — Ease stays 8 (the link now lands on the whole trace)
