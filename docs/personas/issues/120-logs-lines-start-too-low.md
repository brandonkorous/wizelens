# 120 — Logs: "Errors" means two things, and the lines start below the first screen

**Status:** fixed
**Severity:** design
**Found by:** P01's and P03's gaps on Logs (score 7), picked up in the 7-to-9 plan
**Surface:** Logs (`#/logs`)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta Logs at 1440 and 360, 01:11

## What happened

The card "Errors 173" counted error-level log lines while the Errors page beside it counted 65 exceptions: one word,
two numbers. At 1440 and at 360 the log lines started below four cards, a volume chart and an empty "Log Metrics"
box that only said there were no saved searches.

## What should have happened

The cards say they count lines, and the lines come right after the filters.

## The fix

- `ui/src/pages/logs/LogsPage.tsx`: the cards read Log Lines, Warning Lines, Error Lines, Critical Lines; the order
  is cards, filters, saved searches, the lines, then the volume chart and patterns.
- `ui/src/pages/logs/LogMetrics.tsx` and `styles/pages/logs.css`: with no saved search, "Log Metrics" is one slim line
  with "Alert on this search" and "Save this search".

## Confirmation

- 01:11, Greta at 1440: cards "Log Lines 240, Warning Lines 11, Error Lines 99, Critical Lines 0"; the line table starts
  at 607 px of a 900 px window (was below the chart); the slim bar holds both actions.
- 01:11, Greta at 360: four numbers on the first screen, then search and "Filters", the slim bar, and the lines at 821 px.
