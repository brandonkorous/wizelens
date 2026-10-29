# 213 — On a phone trace compare's numbers are eight tall cards

**Status:** fixed
**Severity:** minor
**Found by:** P03, `#/traces/<a>/compare/<b>` at 360
**Surface:** Trace › Compare
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid at 360 light and dark: Numbers is one table headed A, B, B − A with no scrollbar

## What happened

Each of the eight numbers became a card of four lines, so the comparison took several screens.

## Where it lives

Every table becomes cards on a phone.

## Fix

`Table` takes `narrow` for a few short columns: it stays a table on a phone. Compare's headers shorten to A and B there.
