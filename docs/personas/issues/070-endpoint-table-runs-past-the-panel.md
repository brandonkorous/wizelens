# 070 — A long endpoint name pushes the Busiest endpoints table past the side panel

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 11
**Surface:** Services › service panel › Busiest endpoints (every `wl-wrap` table cell)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 11 · cloud Services
**Blocked on:** —

## What happened

Web App's panel listed `GET /_framework/Microsoft.AspNetCore.Authorization.wasm`. The name has no break point, so the
table grew wider than the panel: Count and Avg ran off its right edge.

## What should have happened

A long name wraps inside its cell.

## Where it lives

`.wl-table .wl-wrap` (`ui/src/styles/ui.css`) used `overflow-wrap: break-word`, which does not shrink a table cell's
minimum width.

## The fix

`overflow-wrap: anywhere` (it does), keeping `min-width: 12ch` so names do not break into single letters (#047).

## Confirmed by

2026-10-27 19:51, cloud Services › Web App: every row fits the panel; the long `.wasm` names wrap in two lines, and
Count and Avg stay inside.
