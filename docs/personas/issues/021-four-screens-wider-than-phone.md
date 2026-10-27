# 021 — Trace, Compare, Search and Connect scrolled sideways on a phone

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · scoring at 360 px
**Surface:** Dashboard › Trace (every tab), Trace compare, Search, Connect (and Logs › Log Metrics, same rule)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-measured as P01 at 360 px — Trace, Trace › SQL, Trace › Logs, Compare, Search and Connect all scroll 0 px sideways
**Blocked on:** —

## What happened

Scoring the screens Dani used, at 360 px (`scrollWidth − innerWidth`): Trace 202 px (every tab), Search 91, Connect 36,
Compare 29. Causes, one each: the trace's Compare / JSON / Tag this / Refresh row could not wrap; Search's Requests /
Traces / Spans / Logs tabs could not wrap (`overflow: visible` without `flex-wrap`); a panel head (a long title and a
no-wrap link, e.g. Connect's `http://localhost:3001/_wizelens`) could not wrap, and Compare's waterfall had no scroll box;
Connect's source grid asked for `minmax(380px, 1fr)`, wider than the phone.

## What should have happened

The page never scrolls sideways; rows wrap, and wide content scrolls inside its own box, as tables do (#017).

## Why it matters

Same as #017: the whole page, header and bottom bar move with a sideways swipe.

## Where it lives

`styles/trace.css` `.wl-trace-title`, `styles/pages/cloud.css` `.wl-trace-actions`, `styles/pages/search.css`
`.wl-search-bar .wl-tabbar`, `styles/ui.css` `.wl-panel-head`, `pages/trace/TraceCompare.tsx`, and
`styles/pages/settings.css` `.wl-settings-sources` (and its twin `.wl-log-metric-grid` in `styles/pages/logs.css`).

## The fix

`flex-wrap: wrap` on the trace title row, its actions, the Search tabs, and every panel head (its `h2` may break long
words); Compare's waterfall sits in `.wl-table-wrap`; both 380 px grids use `minmax(min(380px, 100%), 1fr)`. The other
fixed-width grids (`.wl-traces-top`, `.wl-grid-side`, `.wl-split`, Metrics) already fold at 900 or 1200 px.

## Confirmed by

> Re-measured as P01 at 360 px after the change: `#/traces/903f5c7f…` 0, `…/sql` 0, `#/search?q=boards` 0,
> `#/traces/903f5c7f…/compare/03698c2c…` 0, `http://localhost:3001/_wizelens/#/connect` 0, `…/traces/6cb9c75b…/logs` 0.
> At 1440 px in light and dark the same screens are unchanged (title and actions on one row, tabs on one row).

## Rating effect

Trace › Timeline / SQL / Logs, Trace compare, Search, Connect — Design at 360 px no longer marked down for sideways scroll
