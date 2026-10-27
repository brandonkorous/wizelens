# 014 — Dani typed the board's path into Traces search and the list did not change

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 9
**Surface:** Dashboard › Traces (and Requests, Logs) › search box
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 9 — Traces search filtered to the board's calls while typing, no Enter
**Blocked on:** —

## What happened

On `#/traces` Dani typed `boards/c2be23b0-868c-407f-bd45-adc4592e8a7a` into "ID, path, or
service; or service:api duration:>2s" and waited 4 s. The list still began with
`/api/v1/realtime 2.21 s`. Dani opened the top row and compared two realtime polls, not
two board loads. Only Enter applies the search; nothing on screen says so.

## What should have happened

The list filters while Dani types, as on Errors ("Search errors by type or message…"),
Database, Insights, Security, Rendering and Users.

## Why it matters

Two search boxes that look the same and act differently. The first one Dani met filtered
live, so Dani trusted the unchanged list and picked the wrong trace.

## Where it lives

`js/packages/ui/src/ui/QueryBar.tsx` — `onSubmit` only on Enter. `ListQueryBar` (Traces,
Requests, Logs) uses it; `SearchInput` pages use `useSearchText` (250 ms pause).

## The fix

`QueryBar` got a `live` prop: a valid draft runs the search 400 ms after the last key, as the `SearchInput` pages do.
Enter still runs it at once, and an invalid draft still waits with its error under the box. `ListQueryBar` turns it
on, so Traces, Requests and Logs all filter as you type. The Search page keeps Enter only.

## Confirmed by

> Re-ran P01 act 9: `#/traces`, typed `boards/c2be23b0-868c-407f-bd45-adc4592e8a7a`, no Enter. Within the pause the
> URL became `#/traces?q=boards%2Fc2be23b0-…`, the count went to 588, and the first rows were `…/clans`, `…/members`,
> `…/realtime-ticket` and the board load `/api/v1/boards/c2be23b0-… 14 ms`.

## Rating effect

In-app › Traces — Ease 6 → 7
