# 208 — Uptime says "All up" when there are no checks

**Status:** fixed
**Severity:** major
**Found by:** P02, cloud `#/uptime` with no checks
**Surface:** Uptime › cards
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid on the local cloud, Uptime with no checks at 1440 light: no cards, only "No checks yet"; the note now reads "No checks are on" when every check is off

## What happened

With no checks at all, the Checks Up card said "–" over "All up", and the other three cards were dashes. "All up" is false: nothing is checked.

## Where it lives

`pages/uptime/UptimeCards.tsx` built the note from down and pending counts and fell back to "All up" when both were zero, which is also true of zero checks.

## Fix

With no checks the cards are not drawn (the empty list says it); with checks that are all off the note reads "No checks are on". The stray heart icon in the empty text is gone.
