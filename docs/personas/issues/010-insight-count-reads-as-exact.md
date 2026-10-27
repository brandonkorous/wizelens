# 010 — Insights said "runs 7 times per request"; the trace Dani had open said 10

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 6
**Surface:** Dashboard › Insights › N+1 query pattern (row and detail)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 6 — Insights row now reads "runs 7 times per request on average"
**Blocked on:** —

## What happened

Dani moved a card into a 10-card list. The trace named the N+1: the
`update "cards" set "order_index" = $1 where "cards"."id" = $2` query "ran 10 times".
Insights then said "A query on cards runs 7 times per request in POST
/api/v1/boards/:boardId/cards/:cardId/move", next to "Seen in 14 requests · Repeats 99".

## What should have happened

7 is 99 ÷ 14, a mean over 14 moves into lists of different sizes. The sentence
should say so. Both numbers are true; only the wording made them disagree.

## Why it matters

A developer checks the tool against the one trace they know. When the numbers do
not match, they stop trusting both.

## Where it lives

`js/packages/core/src/stats/insights.ts` — `describe()` printed `count / occurrences`
as if exact. The same for "similar calls per request" (N+1 HTTP) and "with the same
parameters" (duplicate query).

## The fix

`describe()` takes the number of requests. Over more than one, the three counts say
"on average". One request keeps the exact wording. Test: `insights.test.ts`, "says
the count is an average only when it is one".

## Confirmed by

> Re-ran P01 act 6: `#/insights`, N+1 row — "A query on cards runs 7 times per request on
> average in POST /api/v1/boards/:boardId/cards/:cardId/move … 14 · 241 ms".

## Rating effect

In-app › Insights — Ease 7 → 8
