# 059 — The HUD and the dashboard give two render times for the same basket page

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 6
**Surface:** HUD on a Razor page (`/Basket`) › card and details
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 6 · HUD on /Basket
**Blocked on:** —

## What happened

After #058, one load of `/Basket` at 18:57:37:

| | Total | Server | Database | Render |
| --- | --- | --- | --- | --- |
| HUD | 365 ms | 293 ms | 15 ms | 58 ms |
| Dashboard trace | 416 ms | 293 ms | 15 ms | 110 ms |

The HUD's "Page load 365 ms" and "LCP 428 ms" sit side by side, and its "First paint" row reads 58 ms.

## What should have happened

One number for one page load. The page view says first paint (FCP) was at 416 ms.

## How to reproduce

1. eShop with the HUD; open `/Basket` (a page whose first paint comes after DOM-ready: 24 product images).
2. Compare the HUD card with the trace header of the same load. Most loads.

## Why it matters

Sid is asked to trust two numbers that differ by 50 ms for the same click; the HUD is the one that is wrong.

## Where it lives

`js/packages/browser/src/recorder.ts` `showDocument` makes the page's row once, when the script starts.
`document-request.ts` `firstPaintMs` uses DOM-ready when first paint has not happened yet, and the row is never
updated.

## The fix

`browser/src/document-request.ts` `whenPainted`: watches for the first contentful paint (buffered) and reports the
render time once; `recorder.ts` `showDocument` patches the page's row with it. Until the paint lands the row keeps
the DOM-ready time, as before. Test: `document-request.test.ts`.

## Confirmed by

2026-10-27 18:59:59, P03 Sid, `/Basket`: HUD card 388 ms Total · 261 ms Server · 14 ms Database · 117 ms Render;
the dashboard trace of the same load (`01d192f0…`) reads 388 · 261 · 14 · 117 ms, and the HUD's First paint row
117 ms.
