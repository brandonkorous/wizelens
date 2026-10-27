# 017 — Every paged list scrolled sideways on a phone

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 9 (360 px check)
**Surface:** Dashboard › every list with pages (Traces, Requests, Logs, Errors, Database, …)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 9 at 360 px — Traces, Requests, Logs, Errors and Database have no sideways page scroll
**Blocked on:** —

## What happened

At 360 px the Traces page scrolled sideways by 64 px. The page buttons and the "Rows per page" menu (`.wl-pages`) are one
row that cannot wrap: 371 px wide on a 360 px screen.

## What should have happened

The buttons wrap to a second line; the page itself never scrolls sideways.

## Why it matters

A sideways-scrolling page on a phone drags the whole layout, header and bottom bar with it. It is the shared `Pager`, so
every paged list had it.

## Where it lives

`js/packages/ui/src/styles/ui.css` — `.wl-pager .wl-pages` had no `flex-wrap`.

## The fix

`flex-wrap: wrap` on `.wl-pager .wl-pages`. One rule, every pager.

## Confirmed by

> Re-ran P01 act 9 at 360 px and measured `scrollWidth − innerWidth` on `#/traces?q=boards…`, `#/requests`, `#/logs`,
> `#/errors`, `#/database`: 0 on all five (Traces was 64). Wide tables still scroll inside their own box, as built.

## Rating effect

In-app › Traces — Design (360 px) deduction removed; the same for each paged list
