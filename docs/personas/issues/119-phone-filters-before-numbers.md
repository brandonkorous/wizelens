# 119 — On a phone, filters and tall cards push every number and list below the first screen

**Status:** fixed
**Severity:** design
**Found by:** P04 · Haddad Studio · scoring sweep at 360; P02's gaps on Overview and Traces at 360
**Surface:** Errors, Requests, Traces, Logs, Database filters; stat cards on every page (Overview, Requests, …)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 Noor at 360 (light and dark), 01:07; P02 Greta at 1440, 01:08

## What happened

At 360 px Errors showed seven filters and a Reset button before its first number; Requests six. Each stat card took
a whole row, so Overview's six numbers ran over two screens and the Traces list started after four full-width cards.

## What should have happened

On a phone the numbers come first: the search box and one "Filters" button, then the cards two to a row, then the list.

## The fix

- New `ui/src/ui/FilterPanel.tsx`: the filter panel of Errors, Requests, Traces, Logs and Database. On a phone it shows
  the search box and "Filters (n)", n being the filters in use; a tap shows the rest, two to a row.
- New `ui/src/styles/phone.css`: up to 720 px, stat cards two to a row with no icon; Overview and Requests cards too
  (`overview.css`, `requests.css`).

## Confirmation

- 01:07, Noor at 360: Errors' first number at 364 px (was below the first screen), four numbers on the first screen;
  Requests' table at 774 px (was 1123); Overview's six numbers on the first screen; the Traces list at 759 px (was
  after four full-width cards). "Filters" opens 4 to 5 selects; nothing scrolls sideways. Dark the same.
- Rule 7, 01:08, Greta at 1440: on all five pages the button is hidden, every select shows, and four cards share a row.
