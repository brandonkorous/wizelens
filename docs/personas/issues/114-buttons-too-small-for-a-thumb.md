# 114 — On her phone, many buttons are too small for a thumb

**Status:** fixed
**Severity:** design
**Found by:** P04 · Haddad Studio · standing check: without a mouse (thumbs, tap targets at least 44 px)
**Surface:** every dashboard screen: the top bar, list tick boxes, row actions, column headers, buttons
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 re-run, 2026-10-28 00:35 (Uptime, 360, dark); P02 Greta Connect › Sending keys at 1440 with a mouse, 00:36

## What happened

Measured at 390 px on Uptime (the same parts are on every screen): the top bar's project, time range, account and
search buttons are 37–44 × 40 px; Notifications and Theme 40 × 40. Every list's tick boxes are 16 × 16. The row
actions "Run now", "Edit", "Delete" are 20 px tall, with "Edit" (25 px wide) right next to "Delete". The sort
headers ("Status", "24h", "7d", …) are 20 px tall. Ordinary buttons are 40 px tall. With a thumb, "Edit" and
"Delete" are one slip apart.

## What should have happened

On a touch screen every control is at least 44 px on its short side, or has a 44 px area around it.

## The fix

- New `ui/src/styles/touch.css`, loaded last: under `@media (pointer: coarse)` the top bar buttons, search, ordinary
  buttons, sort headers and row actions are 44 px high, and row actions have room between them.
- `ui/src/ui/Table.tsx` `PickBox`: the tick box sits in a `wl-pick-hit` label, a 44 × 44 area on touch screens;
  the box itself is 20 px there. A mouse sees the old sizes.

## Confirmation

- 00:35, Noor's phone at 360: every control on Uptime measured 44 px high (top bar 44 × 44, "Edit" 41 × 44 with
  4 px before "Delete", sort headers 44). A tap 14 px right of a row's tick box ticked it: "1 check selected", and
  the page stayed on Uptime.
- Rule 7, 00:36: Greta at 1440 with a mouse ticked a key on Connect › Sending keys; the sizes stay 40 px buttons and
  a 16 px box.
