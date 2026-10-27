# 053 — The Apdex card cuts off its own target: "Excellent · target 50"

**Status:** fixed
**Severity:** design
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 3
**Surface:** In-app (.NET) › Overview › Apdex card (also the cloud Overview)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 3 · Overview
**Blocked on:** —

## What happened

At 1440 px the six stat cards share one row. The Apdex card reads "1.00" and under it
"Excellent · target 50" — the text runs past the card's edge and is cut. "No data for
previous day" on the other cards touches the edge too.

## What should have happened

The note shows in full: "Excellent · target 500 ms". A narrow card wraps it to two
lines, as it already does for "No data" / "for previous day".

## How to reproduce

1. Any app with the default 500 ms Apdex target.
2. Open the Overview at 1440 × 900 (the sidebar open).
3. Every time.

## Why it matters

Sid reads "target 50" as 50 ms, a target ten times stricter than the real one. The
card says something false.

## Where it lives

`js/packages/ui/src/styles/ui.css`: `.wl-delta span { white-space: nowrap; }`, used by
the note in `ui/StatCard.tsx`.

## The fix

`styles/ui.css`: the change and note text may wrap (the `nowrap` is gone), and when a stat card is under 200 px
wide (a container query) that line takes the card width under the icon, not the ~80 px text column.
`ui/ApdexCard.tsx`: "target 500 ms" uses no-break spaces, so it wraps whole.

## Confirmed by

2026-10-27, P03 Sid, eShop on .NET 8, Overview at 1440: the Apdex card reads "Excellent ·" / "target 500 ms"
with nothing past the edge (measured: the note ends inside the card); "No data" / "for previous day" fit on
every card. Dark the same. At 360 the cards are full width and the change line stays in the text column
(Total Requests, Avg Duration, SQL Queries seen); the Apdex card at 360: not checked.
