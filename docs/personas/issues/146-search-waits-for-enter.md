# 146 — The Search page ran only on Enter, while every list box beside it searches as you type

**Status:** fixed
**Severity:** minor
**Found by:** P01, P02 (rating gap on Search, first seen in #014); worked in the 7-score pass
**Surface:** Search
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta and P05 Marisol at 1440, 09:14

## What happened

#014 made the list boxes (Traces, Requests, Logs) search after a pause in typing. The Search page's box still waited
for Enter, so a person who typed and waited, as the lists taught them, saw the old results.

## Fix

`ui/src/pages/search/SearchPage.tsx`: the box is `live`, like the list boxes: it runs 400 ms after the last key, only
when the text is a valid query; Enter still runs it at once.

## Confirmation

- 09:14, Greta types `dojo` and presses nothing: the address gets `q=dojo` 311 ms after the last key; tabs "Requests
  (191) · Traces (246) · Spans (1,000+) · Logs (45)".
- 09:14, Marisol types `loans` with Member Portal chosen: `q=loans` after 317 ms, all tabs 0 (loans are in Loan Desk API).
- Kept: a bare word does not look inside SQL parameters (`@wizelens.db.parameters:*Peña*` does).
