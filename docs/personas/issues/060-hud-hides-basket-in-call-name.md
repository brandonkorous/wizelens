# 060 — The HUD calls my basket page "GET /.../{handler?}"

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 6
**Surface:** HUD on a Razor page (`/Basket`) › details › Calls
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 6 · HUD details on /Basket
**Blocked on:** —

## What happened

The HUD's call list on `/Basket` reads `GET /.../{handler?} (page) · 3 S…` at 1440 px. The hover title says
`GET /Basket/{handler?} (page) · 3 SQL`. The part that names the page, "Basket", is the part cut away.

## What should have happened

`GET /Basket/{handler?} (page) · 3 SQL`, or at least "Basket". Razor Pages routes end in `{handler?}` on every page,
so every Razor page reads the same.

## How to reproduce

1. eShop with the HUD; open `/Basket`; open the HUD details. Every time, on every Razor page.

## Why it matters

Each call row must say which call it is; on a Razor site they all look alike.

## Where it lives

`js/packages/browser/src/hud/waterfall.ts` `splitName` keeps the last path segment whole and lets the middle shrink;
for `/Basket/{handler?}` the last segment is the route parameter.

## The fix

`hud/waterfall.ts` `splitName`: when the last segment is only a route parameter (`/{handler?}`, `/:id`), the kept
tail starts one segment earlier. Tests: `page-summary.test.ts` (Razor and Express routes). The dashboard's own
names are whole (they wrap), so nothing to change there.

## Confirmed by

2026-10-27 19:02:34, P03 Sid, `/Basket` → HUD details → Calls: `GET /Basket/{handler?} (page)` · 262 ms;
the link opens the request's trace in a new tab.
