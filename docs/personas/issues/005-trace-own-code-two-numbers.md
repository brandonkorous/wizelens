# 005 — The card-move trace shows the API's own time as 1.7 ms in the header and 2.4 ms in the timeline

**Status:** open
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 5 (numbers at the edges)
**Surface:** Dashboard › Trace (header split bar and Timeline)
**Filed:** 2026-10-26
**Fixed:** —
**Confirmed by:** —
**Blocked on:** decision

## What happened

On the card-move trace (`http://localhost:3000/_wizelens/#/traces/d75088eb9b87ea0e227ea2a6fecd7951`)
the header said **Server code 1.7 ms · Database 6.6 ms**, and the timeline row for
the same span said **IN POST /api/v1/boards/:boardId/cards/:cardId/move 8.3 ms · self 2.4 ms**.

Hand count from the spans: the API span runs 0 → 8.33 ms. Seven queries add up to
6.62 ms. The last one, `SELECT integration_connections`, runs 8.13 → 9.00 ms, so
0.67 ms of it is after the API sent its answer.

- 8.33 − 6.62 = **1.71** (the header: every query counts)
- 8.33 − 5.95 = **2.38** (the timeline: only query time inside the span counts)

## What should have happened

One number for "the API's own code" on one page.

## Why it matters

Small here, but it is the shape of a wrong sum: a fire-and-forget query after the
response (an audit write, a cache fill) of 300 ms would make "Server code" go to
zero or below and push the user-facing time into Database.

## Where it lives

`js/packages/core/src/health.ts` — `timingSegments` takes `serverMs − dbMs` over all
queries. `traceTiming` already has the clipped value as `server.codeMs` (its own doc:
"time in the service's own code: not in its own queries"), which matches the timeline.

## The decision (Brandon's)

1. **Count only what ran inside the request (recommended).** The split uses
   `server.codeMs` / `server.dbMs`; the header's Database stays "all queries" and gets
   a line "0.7 ms after the response". The bar then shows where the user's time went.
2. **Count every query in the request.** Keep the split; change the timeline's
   "self" to subtract every child, inside or not. Simpler, but a slow after-response
   job looks like slow server work.

## The fix

## Confirmed by

## Rating effect
