# 023 — The HUD's call list lost the method and its time labels ran together on a phone

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · scoring the HUD at 360 px
**Surface:** HUD › details panel (in kanNINJA's board page)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-opened the HUD details on Dani's board at 360 px — names read "GET /…/:boardId", "POST /…/realtime-ticket"; the axis shows "0 ms" and "400 ms", not overlapping
**Blocked on:** —

## What happened

On Dani's board at 360 px, HUD › details listed the page's calls as `G../:boardId · 7 SQL`, `GE… /clans · 5 SQL`: the cut
ate the method, so a GET and a POST looked alike. The time axis above the bars read `0 ms200 ms 400 ms` — two labels
on top of each other. At 1440 px the names were cut the same way (`POS... /realtime-ticket`) and the last label, `600 ms`,
ran past the panel's edge.

## What should have happened

The method always shows; the middle of the path is what gets cut, with a visible "…". Axis labels never touch and stay
inside the panel. Same rule as the dashboard's charts (#022) — this is the HUD's own renderer, so it needed its own fix.

## Why it matters

The HUD is where a developer first looks; "which call was the slow POST" must be readable on the phone they test on.

## Where it lives

`js/packages/browser/src/hud/waterfall.ts` `splitName` / `rowName`, `js/packages/browser/src/hud/style.ts` `.wl-wf-*`.

## The fix

`splitName` returns method, middle and last segment; the method never shrinks (`.wl-wf-method`), the middle keeps room for
an ellipsis. The last axis label is right-aligned at its tick; when the track is under 240 px wide (a container query),
only the first and last labels show. Test: `page-summary.test.ts` "splits a name into method, middle and last path segment".

## Confirmed by

> Re-opened HUD › details as P01 on the board (`p01-hud-axis`). 360 px dark: labels "0 ms", "400 ms", no overlap, none
> outside the panel; every row starts with its method ("GET ", "POST "), none cut; rows read "GET /…/members · 6",
> "POST /…/realtime-ticket". 1440 px light: labels "0 ms · 200 ms · 400 ms · 600 ms", no overlap, none outside.

## Rating effect

HUD details panel — Design at 360 px 6 → 8
