# 105 — On a phone, the top bar's menus open off the left edge of the screen

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 10 (sharing her slow page)
**Surface:** top bar menus: project, Time range, Save this view, Share this page, notifications
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** at 23:53 Noor tapped "Share this page" on Rendering on her 390 px phone: the whole box showed ("A read-only link to this page as it is now: its numbers are kept and do not change. Anyone with the link can open it.", "For 7 days", "Make a link"). All six top-bar menus now open at 8 px to 382 px (390) and 8 px to 352 px (360). Rule 7: at 23:55 Greta's six menus did the same on a 390 phone; on her 1440 px desktop each still opens under its own button (project 542–889 … account 1176–1416).

## What happened

At 23:50 on her 390 px phone Noor tapped "Share this page" on Rendering. The box opened with its left part off the
screen: "…link to this page as it is now: its … kept and do not change", an expiry choice cut to "ys", and half of
"Make a link". She could not read what the link does or pick how long it lasts. Measured at 390 px: the project menu
starts at −151 px, Time range at −82, Save this view at −126, Share at −85, notifications at −101. At 360 px all of
them are off too. Only the account menu fits.

## What should have happened

Every menu opens inside the screen, full width less a margin, under the top bar.

## The fix

`ui/src/styles/shell.css`, phone block (≤720 px): `.wl-topbar .wl-menu-anchor` is not positioned, so a top-bar menu is placed
by the sticky top bar and spans it, 8 px in from each side. Wider screens keep the menu under its button.
