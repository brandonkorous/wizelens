# 027 — I cannot see how slow a query is for most of its runs, only the average and the worst one

**Status:** fixed
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 4
**Surface:** Cloud › Database (list) and Cloud › Database › Query shape
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 4 on the cloud after a restart (stats rebuilt to facts 14) — Database › Most total time now heads `Query Avg P95 Max Count Total Time`; the `auth_users` by-id row reads 2.8 ms · 4.3 ms · 41 ms · 44 · 121 ms, and its Query page head reads RUNS 44 · AVERAGE 2.8 ms · P95 4.3 ms. Same numbers on both screens.
**Blocked on:** —

## What Greta saw

She sorted Database by "Most total time". The top row is the `auth_users` lookup by id: 44 runs, 121 ms total.
The row shows Avg 2.8 ms and Max 41 ms. She opened it. The Query page shows Runs, Average, Errors and System.

Her job in act 4 is "its p95". No screen gives it. Avg hides the tail and Max is one bad run, so she cannot
tell whether 41 ms is a one-off or one run in twenty. A DBA sizes an index on the p95, not on the mean.
The Endpoint page already shows p50/p95/p99, so the product knows how; it only skips queries.

## Where it lives

`core/src/scale/kinds.ts`: `db.q` and `db.qd` keep no histogram (`hist: false`), so no read can
compute a percentile. `models/database.ts` and `models/query-page.ts` therefore only have avg and the top run.

## Fix

- `db.q` and `db.qd` keep a histogram; `facts-db.ts` adds each run's time to it. `FACTS_VERSION` 13 → 14,
  so every host rebuilds its stats from the stored traces on start (no migration, no data loss).
- The Database list need and the Query page needs ask for the histogram. `QueryRow.p95Ms` and
  `QueryTotals.p95Ms` (null when a row was stored without it).
- Database list: a **P95** column between Avg and Max. CSV export: `p95_ms`. Query page head: **P95**.
- Test: `detail-pages.test.ts` "gives each query shape a p95 …" checks it against the hand-computed
  nearest-rank p95 of the raw runs, within the histogram's 2%.
