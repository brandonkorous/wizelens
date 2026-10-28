# 054 — The request chart counts 0, 38, 75, 113, 150

**Status:** fixed
**Severity:** design
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 3
**Surface:** In-app (.NET) › Overview › Request Activity (every time chart)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 3 · Overview
**Blocked on:** —

## What happened

After 103 requests the Request Activity chart's left axis read "0, 38, 75, 113, 150".
At 37 requests it read "0, 10, 20, 30, 40". Sid has to work out what 113 means
before he can read a bar against it.

## What should have happened

Round steps: 0, 50, 100, 150.

## How to reproduce

1. Any app whose busiest bucket holds 101 to 150 requests (the top becomes 150).
2. Open the Overview. Every time. The same happens for tops of 2.5, 15, 25, 250, …
   (steps of 0.625, 3.75, 6.25, 62.5).

## Why it matters

Cosmetic, but on the first chart of the first screen; it reads as careless.

## Where it lives

`js/packages/ui/src/ui/chartMath.ts`: `niceMax` picks a top from 1, 1.5, 2, 2.5, 3,
4, 5, 6, 8, 10 × 10ⁿ, and `ticksOf` always cuts it into 4. Used by `ui/TimeChart.tsx`
and `pages/traces/LayerTimeline.tsx`.

## The fix

`ui/chartMath.ts`: `stepsOf` picks the step count for each top niceMax can give (1→5, 1.5→3, 2→4, 2.5→5, 3→3,
4→4, 5→5, 6→3, 8→4, 10→5), and `ticksOf` uses it unless a count is given. Checked by hand for tops from 0.8
to 1500: every step is 0.2, 0.5, 1, 2 or 5 × 10ⁿ. `TimeChart.tsx` keeps one tick per unit for tops of 4 or less.
The trace layer timeline uses the same `ticksOf`.

## Confirmed by

2026-10-27, P03 Sid, Overview › Request Activity: with 136 requests the axis read 0, 50, 100, 150 (dark); with
169 it read 0, 50, 100, 150, 200 (light).
