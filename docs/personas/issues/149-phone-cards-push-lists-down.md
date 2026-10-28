# 149 — On a phone, "Nothing to compare in the previous 7 days" took three lines in every stat card

**Status:** fixed
**Severity:** minor
**Found by:** P01, P02, P03, P04 (rating gaps on Overview, Traces, Errors, Logs at 360)
**Surface:** every page with stat cards, at 720 px and below
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta at 360 dark touch and 1440, 09:24; P05 Marisol at 360 dark touch, 09:25

## What happened

At 360 the cards stand two to a row, but a young org's cards each said "Nothing to compare in the previous 7 days" in
three lines. Two rows of cards were about 350 px tall, so the Traces list began at 681 px, below the first screen.

## Fix

`ui/src/ui/StatCard.tsx` marks the no-compare line `wl-delta-none`; `styles/phone.css` hides it at 720 px and below.
A real change ("↑ 12% vs. previous 7 days") still shows. Wide screens keep the line.

## Confirmation

- 09:24, Greta at 360 dark: the first panel after the cards moved up about 115 px on each page. Overview's Request
  Activity 757 → 599, Traces list 681 → 568 (inside the 780 px window), Errors Over Time 660 → 547, Logs lines 830 → 717.
- 09:25, Greta at 1440: the line reads "Nothing to compare in the previous 7 days" and shows; Marisol at 360: same text,
  hidden.
