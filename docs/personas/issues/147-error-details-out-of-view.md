# 147 — Error details opened out of view, and said "not in the selected time range" while still loading

**Status:** fixed
**Severity:** minor
**Found by:** P01 (rating gap on Errors: details below the first screen at 1440); the wrong message found by P02 Greta in this pass
**Surface:** Errors
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta at 1440 and 1024, 09:18; P04 Noor at 360 dark, 09:18

## What happened

- The details panel sits beside the list, level with its top. Below 1200 px it came after the list and after "Errors
  by Service", so a picked error opened far down the page.
- Greta picked the Resolved `ECONNREFUSED` row and the panel said "This error is not in the selected time range. Pick
  a longer time range…" for as long as the group took to load. It was in the range; it was loading.

## Fix

- `styles/pages/errors.css`: over 1200 px the details stay in view while the list scrolls (sticky, like Requests);
  at 1200 px and below they come right after the list, before Errors by Service.
- `ui/src/pages/errors/ErrorDetails.tsx`, `ErrorsPage.tsx`: while a picked group loads the panel says "Loading this
  error…"; "not in the selected time range" only when it has loaded and is not there.

## Confirmation

- 09:18, Greta at 1440, each of the 5 rows clicked from the bottom up: the first reads "Loading this error… →
  ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5433", the others go straight to their error. The panel top stays at 206 px.
- 09:16, Greta at 1024 dark: the last row opens the details at 206–833 px of a 900 px window.
- 09:18, Noor at 360 dark: Recent Exceptions (1098 px), Error Details (1340), Errors by Service (2420).
