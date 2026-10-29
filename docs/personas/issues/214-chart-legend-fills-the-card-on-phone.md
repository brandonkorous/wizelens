# 214 — On a phone a chart's legend fills the card

**Status:** fixed
**Severity:** minor
**Found by:** P06, `#/dashboards/<id>` at 360
**Surface:** Every chart
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid at 360 dark, a legend given seven names: four show, then "Show all 7"

## What happened

A chart grouped by method, status and path listed seven names, one per line, under a small chart.

## Where it lives

The legend listed every line.

## Fix

`ChartLegend` shows four names on a phone and folds the rest behind "Show all".
