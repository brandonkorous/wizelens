# 121 — On a phone, tab rows that scroll sideways give no sign of it

**Status:** fixed
**Severity:** design
**Found by:** P04 · Haddad Studio · scoring sweep at 360 (Connect cut "Sending keys"); P03's gap on Trace › Timeline tabs
**Surface:** every sections nav (Connect, People & access, Organization), every TabBar, the trace tabs
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 Noor Connect at 360, 01:11; P02 Greta Connect at 1440, 01:11

## What happened

At 360 the Connect tabs ran off the right edge mid-word ("Sending ke"). Nothing said the row scrolls, and opening
`#/connect/keys` directly left its own tab out of view.

## What should have happened

The edge that hides more tabs fades, and the open tab is in view.

## The fix

- New `ui/src/ui/useScrollHint.ts`: marks the hidden edges (`data-more`) as the row scrolls or resizes, and centers
  the open tab. Used by `ui/Sections.tsx`, `ui/Panel.tsx` (TabBar) and `pages/trace/TraceTabs.tsx`.
- `ui/src/styles/phone.css`: a 40 px fade on each marked edge.

## Confirmation

- 01:11, Noor at 360: Connect › setup fades on the right; swiped to the end, on the left; opened at `#/connect/keys`,
  "Sending keys 4" is in the middle with both edges faded.
- Rule 7, 01:11, Greta at 1440: the sections list fits, so no edge is marked and nothing fades.
