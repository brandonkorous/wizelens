# 016 — A board path filled nine lines of the Traces list

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 9
**Surface:** Dashboard › Traces › list
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 9 — the board's four calls each take two lines plus the trace id, and `/clans` and `/members` read at a glance
**Blocked on:** —

## What happened

After the search in act 9, the Traces list (the narrow left panel at 1440 px) showed
`/api/v1/bo|ards/c2be|23b0-|868c-|407f-|bd45-|adc4592e|8a7a/clan|s` — one row, nine lines, cut inside words. Two and a half
rows fit on the screen, and the part that tells them apart (`/clans`, `/members`, `/realtime-ticket`) was on the last line.

## What should have happened

A path short enough to scan, with its end in view, like the other lists (they show one line and the full path on hover).

## Why it matters

Act 9 is "pick the board load out of the list". With nine-line rows the board load itself was the fourth row, below the fold.

## Where it lives

`js/packages/ui/src/pages/traces/RecentTraces.tsx` — Trace ID and Path were two columns in a ~340 px panel, and the
cell used `.wl-wrap` (`word-break: break-word`).

## The fix

`shortPath` in `ui/src/format.ts` cuts each long id segment (a uuid, a 16+ character hex id, a 10+ digit number) to its
first 8 characters and a "…"; the query string and plain words stay whole. The Traces row shows that path, wrapping only
after a `/` (`<wbr>`), with the full path on hover, and the short trace id on a small second line under it, in one
"Path · trace ID" column. So the path gets the room the id column took.

## Confirmed by

> Re-ran P01 act 9: `#/traces`, search `boards/c2be23b0-…`. Rows read `/api/v1/boards/ c2be23b0…/clans` + `e67237c9`,
> `…/members` + `29512e02`, `…/realtime- ticket` + `f927931c`, 79–99 px tall (were 100–180 px). Hover shows the full path.
> Checked in dark, light and at 360 px (no sideways scroll).

## Rating effect

In-app › Traces — Design 6 → 7
