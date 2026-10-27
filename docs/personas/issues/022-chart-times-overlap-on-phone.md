# 022 — Chart times ran into each other on a phone

**Status:** fixed
**Severity:** cosmetic
**Found by:** P01 · kanNINJA web team · scoring at 360 px
**Surface:** Dashboard › every time chart (Overview, Search, Errors, Logs, Database, …)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-measured as P01 — no two axis labels overlap on 7 pages at 360 px or at 1440 px; Search's chart reads "11:59 PM · 7:59 AM · 3:59 PM"
**Blocked on:** —

## What happened

At 360 px the Search chart's time axis read `11:54 PM54 AM54 A…54 PM54 PM`. Measured on screen, the time labels of the
charts on Overview, Search, Errors, Logs and Database overlapped pairwise (`"11:55 PM" x "3:55 AM"`, …).

## What should have happened

Fewer labels on a narrow chart, each readable.

## Why it matters

The axis is how a person on a phone tells when the spike happened.

## Where it lives

`js/packages/ui/src/ui/TimeChart.tsx` `Axes`: always 6 time labels, whatever the chart's width.

## The fix

The label count fits the plot width: one per 72 px (a label like "11:55 PM" is about 50 px), at least 2, at most 6. One
component, every time chart.

## Confirmed by

> Re-measured as P01 (`p01-tick-overlap`): Overview, Search, Requests, Errors, Logs, Database, Traces — no overlapping
> axis labels at 360 px, none at 1440 px. Search's chart at 360 px shows three labels: 11:59 PM, 7:59 AM, 3:59 PM.

## Rating effect

Overview, Search, Errors, Logs, Database — Design at 360 px no longer marked down for the time axis
