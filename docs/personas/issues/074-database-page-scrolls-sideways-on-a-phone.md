# 074 — On a phone, the Database page scrolls sideways under its insight badges

**Status:** fixed
**Severity:** design
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · scoring at 360
**Surface:** Database › Latest Insights (in-app and cloud)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · scoring · Database at 360 and 1440
**Blocked on:** —

## What happened

At 360 px the Database page was 391 px wide. "Repeated query opportunity" stayed on one line and pushed its
"Medium" and "Low" badges past the right edge of the screen.

## What should have happened

The title wraps and its badge stays inside the card.

## Where it lives

Two screens share the class `wl-insight-title`. The trace page's rule (`trace.css`: `white-space: nowrap`, for its
one-line finding rows) also applied to the Database page's insight cards.

## The fix

The trace rule is scoped to its own rows (`.wl-insight .wl-insight-title`); the Database card title may wrap
(`flex-wrap: wrap`).

## Confirmed by

2026-10-27 20:20, https://localhost:5001/_wizelens/#/database at 360: page width 360 (was 391); "Repeated query
opportunity" wraps to two lines, "Medium" and "Low" sit under it inside the card. At 1440 the two cards read the same
way, side by side.
