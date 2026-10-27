# 046 — On the cloud the top bar is wider than the window, and my name is cut off

**Status:** fixed
**Severity:** design
**Found by:** P02 · kanNINJA ops · scoring (light, dark, 360px)
**Surface:** Cloud › every page (the top bar)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-shot all 26 cloud screens Greta opened, as Greta, in light 1440, dark 1440 and light 360: sideways overflow 0 on every one (was 13–135px at 1440, 34–128px at 360); at 1440 the bar reads "kanninja-prod… 2/3", "Last 7 days" and "Greta Lind…" (Cloud › every page)
**Blocked on:** —

## What Greta saw

At 1440px the user button "Greta Lindqvist-Ochoa" ran past the right edge on every page, and the page scrolled
sideways by 13px (settings pages) to 135px (Overview, Requests, Database, where the time range, Save view and
Share buttons show too). On a 360px phone every page scrolled sideways by 34 to 128px: eight top bar buttons,
about 500px wide, in a 360px window.

## Where it lives

`ui/src/styles/shell.css`: no top bar item could shrink (buttons are `white-space: nowrap` with no `min-width: 0`),
the search box had a 260px floor, and a long name took 230px. The cloud adds the user and notification buttons
that the in-app dashboard does not have, so the in-app bar fitted and this one did not.

## Fix

- Only the project switcher and the user name give up width, with an ellipsis (`wl-top-shrink`); the user
  name is at most 110px. Icons, the time range, Save view, Share and notifications keep their size.
- The search box starts at 200px and grows into free space; the gap is 10px up to 1500px.
- At 720px and under: 4px gaps, slimmer buttons, and the arrows and the "2/3" count are hidden (the menu
  shows them).
