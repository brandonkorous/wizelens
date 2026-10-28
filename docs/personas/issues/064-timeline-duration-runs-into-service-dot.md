# 064 — A long bar's duration runs into the service dot, so "self 28 ms" reads "self 2● ms"

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 7
**Surface:** Trace detail › Timeline (every stack)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 7 · Trace detail
**Blocked on:** —

## What happened

In the admin save's trace (`a1b1f438…`), `PUT /api/catalog-items` starts at 0 and runs to the end. Its label
"133 ms · self 28 ms" is drawn before the bar, which is outside the track, over the name column's service dot at
x = 678: the screen reads "self 2● ms". The browser row's "136 ms" touches its dot the same way.

## What should have happened

The duration stays in the track: after the bar, before it, or on it.

## How to reproduce

1. Any trace whose top span starts at 0 and ends past 82 % of the axis (most traces). Timeline tab, 1440 px.

## Why it matters

The numbers are the reason to open the timeline; a covered digit is a wrong number.

## Where it lives

`js/packages/ui/src/pages/trace/Waterfall.tsx`: a bar ending past 82 % puts its label at `right: 100 - left`, with no
check that there is room before it.

## The fix

`Waterfall.tsx` `durPlace`: after the bar when it ends by 82 %, else before it when it starts at 18 % or later, else on
the bar's end as a small chip (`.wl-wf-dur-in`: surface background, text color, line ring), so it reads in both
themes. One rule for every row.

## Confirmed by

2026-10-27 19:21, P03 Sid, trace `a1b1f438…` Timeline at 1440 px, light and dark: all five labels inside their track;
"136 ms" and "133 ms · self 28 ms" sit on their bars' ends, clear of the service dots; "104 ms · self 58 ms" before its
bar; "43 ms" and "4.2 ms" after.
