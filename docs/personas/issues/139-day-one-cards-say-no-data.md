# 139 — On day one every number card said "No data" under a number that had data

**Status:** fixed
**Severity:** minor
**Found by:** P01, P03, P04 (rating gaps on Overview, Errors); worked in the 7-score pass
**Surface:** every stat card (Overview, Errors, Database, Query, Error group)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol 08:54; rule 7 P02 Greta 08:58

## What happened

With no data in the period before, each card showed "2,144" and under it a bold "No data for previous day". Six cards in
a row said "No data" while each held a number, so the words read as a broken page on a team's first day.

## Fix

`ui/src/ui/StatCard.tsx`: with nothing to compare, the foot reads "Nothing to compare in the previous day" as quiet text,
with no bold "No data".

## Confirmation

- 08:54, Marisol's Overview: "Total Requests 2,146 Nothing to compare in the previous day" on five cards; Apdex keeps
  "Excellent · target 500 ms".
- Rule 7, 08:58, Greta (7 days): "Total Requests 2,196 Nothing to compare in the previous 7 days".
