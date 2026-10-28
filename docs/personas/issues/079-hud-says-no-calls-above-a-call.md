# 079 — The HUD says "Calls · 0" right above the call it lists

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · HUD on `/Basket` (Zoë), scoring at 1440 and 360
**Surface:** HUD › details panel › Calls
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · HUD on `/Basket` as Zoë at 1440 and 360 dark; RULE #7 on P01's board HUD
**Blocked on:** —

## What happened

Zoë's basket page makes no fetch calls. The HUD's details panel reads "Calls · 0", and right under it lists one call:
"GET /Basket/{handler?} (page) · 3 SQL", 40 ms, with its first paint. The heading and the list disagree.

## What should have happened

The heading counts what the list shows: the page's own request and every call after it.

## Where it lives

`browser/src/hud/details.ts` `calls()`: the heading prints `snap.view.fetch` (the card's Fetch count, which leaves out
the page's own request), not the rows it lists.

## The fix

The heading counts the rows it lists that are calls (`callCount` in `waterfall.ts`): the page's own request and each
call after it, not the "First paint" or "Route render" rows, plus calls dropped from the top. A test covers a page
with no fetches ("Calls · 1").

## Confirmed by

2026-10-27 21:31, `https://localhost:5001/Basket` as Zoë, 1440 light: the details read "Calls · 1", then
"GET /Basket/{handler?} (page) · 3 SQL" 13 ms and "First paint" 119 ms; the card still reads "0 Fetch". 360 dark: the
same, "Calls · 1" over the page row; the panel fits the screen (the page's extra 61 px is eShop's own basket table).

RULE #7, 2026-10-27 21:36, P01's board in kanNINJA (packages refreshed): "Calls · 6" over six call rows and one
"Route render" row.
