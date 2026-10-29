# 155 — On a phone, docs tables cut off their last column

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 3 (docs at 360)
**Surface:** Site › docs: every page with a table of code (alerts, aspnet-core, configuration, go, java, kubernetes, logs, node, react, releases, sampling, search, security and more)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 360 light, 15:57

## What happened

At 360 px the "What it does" or "Description" column of most docs tables was off the right edge. The table scrolls
sideways, but nothing shows that, so Ifeoma read the option names and never saw what they do. The first column,
full of code that may not wrap, took the room.

## Where it lives

`site/src/styles/prose.css`: `td code { white-space: nowrap }` and `th { white-space: nowrap }`.

## Fix

At 720 px and below, code and headers in a table wrap (`overflow-wrap: anywhere`) and cells are a little tighter, so
every column fits the phone.

## Confirmation

- 15:57, Ifeoma: the docs home and License tables are as wide as their box at 360 (0 px to scroll); every column shows.
