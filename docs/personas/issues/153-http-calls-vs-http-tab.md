# 153 — "HTTP CALLS 0" above a tab that said "HTTP 1"

**Status:** fixed
**Severity:** nit
**Found by:** P02 Greta, in the re-score sweep (Trace › Timeline, 1440 dark)
**Surface:** Trace header; Trace compare
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta at 1440 dark, 09:41

## What happened

On `GET /api/v1/realtime` the header read "HTTP CALLS 0" and the tab below it "HTTP 1". Both were true: the header counts
calls the request made, and the tab also lists the request coming in. The label did not say which.

## Fix

`TraceHeader.tsx` and `TraceCompare.tsx`: the number is "HTTP calls out".

## Confirmation

- 09:41, Greta: the header reads "HTTP CALLS OUT 0" beside the "HTTP 1" tab, whose row is marked IN; compare reads
  "HTTP calls out 0 0 same".
