# 151 — Uptime runs filled the Traces list: one red `/api/health` a minute buried the app's traces

**Status:** fixed
**Severity:** major
**Found by:** P02 Greta, in the re-score sweep
**Surface:** Traces (list and cards); Uptime (subtitle)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta at 1440 dark, 09:37

## What happened

Greta's "kanNINJA API health — every 60 s" check runs each minute and fails while the API is down. Requests, Services,
Errors and Problems skip uptime runs, but the Traces list and its cards did not: the whole first page was red
`/api/health` rows of `wizelens-uptime`, and "Selected Traces 3,772" counted about 1,500 of them. The Uptime page said
"Results are requests of the wizelens-uptime service", but Requests leaves them out and no screen links to them.

## Fix

- `core/src/scale/facts.ts`: a trace with an uptime span gives no Traces list row and no trace counts, like a loose
  trace; `FACTS_VERSION` 18 → 19, so every host rebuilds its lists and rollups. A run still opens by its link.
- Tests: `facts.test.ts` (an uptime run has no list row and no `trace` count), `facts-render.test.ts`, and the parity
  reference in `testing/legacy/traces.ts`. Core 478/478.
- `UptimePage.tsx`: "Their results stay on this page, apart from your app's requests and traces."
- `docs/CONTRACT.md`: the Traces list and its cards join the list that skips runs.

## Confirmation

- 09:36, after the cloud restart and rebuild: "Traces (2,253)" and "Selected Traces 2,253" (were 3,772); no
  `wizelens-uptime` row on the first page; the top rows are kanninja-backend's own `/api/health` route from 11:42 PM.
- 09:38, the run `b2b85c7d…` opens by its link: "GET kanNINJA API health — every 60 s", 1 span.
