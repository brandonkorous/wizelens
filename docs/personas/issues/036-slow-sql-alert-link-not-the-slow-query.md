# 036 — The slow-SQL alert said "View the traces" and did not put the slow query first

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 7
**Surface:** Cloud › Alerts › one rule → Database
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 7 — opened the slow-SQL rule from its email link: the link under the chart reads "View the slow queries" and opens Database with the sort "Most slow runs", the panel "Queries With the Most Slow Runs", and `auth_sessions` by token (max 634 ms, 2 slow) first (Cloud › Alerts › one rule → Database). core tests 454 pass
**Blocked on:** —

## What Greta saw

`Slow SQL on the board load (≥ 250 ms)` fired with "Slow queries is 2". On the rule page the link was
"View the traces", but it opened Database (queries, not traces), sorted by **Most total time**. The slow
query (`auth_sessions` by token, max 634 ms) was on top only because it also ran 280 times. On a day when
a rare report query is the slow one, the frequent fast queries would bury it, and Database had no way to
put "the queries that were slow" first.

## Where it lives

`ui/src/pages/alerts/AlertRulePage.tsx` `tracesHref` sent slow-query rules to `sort=total`, and the link
label was "View the traces" for every metric. `core/src/models/database-filter.ts` sorted by average,
count or total only, though each query shape already counts its slow runs (`c0`).

## Fix

- Database sort **Most slow runs** (`sort=slow`, by the slow-run count) in the model and the sort menu.
- The slow-query rule links there: "View the slow queries".
- The link names what it opens for each rule: "Open the SLO", "View the errors", "View the risks";
  request rules keep "View the traces".
- `filters.test.ts`: the slow sort is in order.
