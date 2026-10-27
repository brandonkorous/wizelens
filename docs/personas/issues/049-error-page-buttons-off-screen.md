# 049 — On my phone the error page cuts off "Alert on this" and hides "Tag this"

**Status:** fixed
**Severity:** design
**Found by:** P02 · kanNINJA ops · scoring (360px)
**Surface:** Cloud › Errors › one error group (and any detail page whose header has many buttons)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 scoring at 360px on the rebuilt cloud — opened "TypeError: RequestInit: Expected signal …" from Errors with "View full error": Resolve and Ignore on one row, the assignee on the next, "Alert on this" and "Tag this" whole on the third; page overflow 121 px → 0. SLO, alert rule and service headers also 0. Light and dark at 1440 unchanged (Cloud › Errors › one error group)
**Confirmed by (P01, RULE #7):** kanNINJA refreshed with the new ui; as Dani in `localhost:3000/_wizelens` opened Overview, a `/board` trace from Traces, the newest error with "View full error", and Database, in light 1440 and dark 360: page overflow 0 and the top bar inside the window on all four (Dashboard · in-app)
**Blocked on:** —

## What Greta saw

At 360px the error group page put Ignore, the assignee menu, "Alert on this" and "Tag this" on one row. The row
ran 121px past the screen: "Alert on this" was cut in half and "Tag this" could not be seen or tapped without
dragging the whole page sideways.

## Where it lives

`ui/src/styles/ui.css`: `.wl-dhead-actions` (the button row of every detail header) is an inline flex row
with no wrap, so it is as wide as all its buttons together.

## Fix

`.wl-dhead-actions` wraps (`flex-wrap: wrap; max-width: 100%`): the buttons go onto a second row when the
screen is narrow. Detail pages with fewer buttons look the same as before.
