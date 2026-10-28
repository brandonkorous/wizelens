# 152 — At 360 the Services table needed a sideways swipe to see any number

**Status:** fixed
**Severity:** minor
**Found by:** P02 Greta, in the re-score sweep at 360 dark
**Surface:** Services
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta at 360 dark touch and 1440, 09:39; P05 Marisol at 360 dark touch, 09:39

## What happened

At 360 the Services table showed the name and Status; "Requests" was cut at the edge and Errors, Error rate, Avg
latency and p95 sat off the screen.

## Fix

`ui/src/pages/services/serviceParts.tsx`: at 640 px and below the five number columns hide and one line under the name
reads "1,746 requests · 0.4% errors · avg 107 ms" ("queries" for a database), the pattern of Sending keys and Alerts.

## Confirmation

- 09:39, Greta at 360 dark: the table does not scroll sideways (0 px over); "kanninja-backend 1,746 requests · 0.4%
  errors · avg 107 ms Healthy"; the local-address row keeps its note.
- 09:39, Greta at 1440: all seven columns, no extra line.
- 09:39, Marisol at 360 dark: "sqlite · :memory: 2,696 queries · 0% errors · avg 0.04 ms".
