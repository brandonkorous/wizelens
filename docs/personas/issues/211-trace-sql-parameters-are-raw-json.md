# 211 — A trace's SQL parameters are a line of JSON with no column

**Status:** fixed
**Severity:** minor
**Found by:** P01 and P03, `#/traces/<id>/sql`
**Surface:** Trace › SQL
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid, GET /order/my-orders at 1440 light and 360 light and dark: "@__buyerId_0 · BuyerId [redacted:email]"; the 6-line query is whole and a 10-line one folds with "Show the whole query"

## What happened

Parameters showed as `params: {"@__buyerId_0":"[redacted:email]"}`, so a hidden value did not say which column it was; long SELECTs filled the screen.

## Where it lives

`pages/trace/SqlTab.tsx` printed the JSON string as is and the whole query text.

## Fix

`SqlParts.tsx` lists each parameter as name · column (from `paramColumns`) and value; a query taller than about nine lines folds to five.
