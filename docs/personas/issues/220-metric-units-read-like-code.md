# 220 — Metric tiles read "0 work item" and "5.00 thread"

**Status:** fixed
**Severity:** copy
**Found by:** P03, Metrics
**Surface:** `#/metrics`
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid at 360 in dark: the thread pool tile reads "0 work items"; core tests cover "5 threads" style counts and leave "50 Hz" alone

## What happened

Count units in curly braces showed with two decimals and no plural.

## Where it lives

`fmtMetric` in `core/src/metrics/format.ts`.

## Fix

Whole numbers show without decimals, and a word unit gets an s when the value is not 1. Units that are not words stay as they are. Chart fills also leave gaps with no data empty, like the line.
