# 092 — On a phone, a page load with a problem is drawn 714 px wide

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 5
**Surface:** Cloud › Traces › one trace, on a 390 px phone (any trace with a problem in its list)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 5 at 22:15: the slow page load is 390 px wide at 390 and 360 px wide at 360; the problem's title wraps inside its card. RULE #7: P02 Greta's board trace at 390 is 390 px wide.
**Blocked on:** —

## What happened

The slow page load now has a problem in its list ("Slow page: the main content showed at 6.14 s; 1 picture is
bigger than the screen needs"). On her phone the problem's title runs off the right edge, and the whole page is drawn
714 px wide and shrunk: small text, sideways sliding, and the bottom bar stretched past the screen.

## What should have happened

The problem's title wraps inside its card, and the page stays 390 px wide.

## Where it lives

`ui/src/styles/trace.css`: a problem row (`.wl-insight`) is a grid whose title never wraps (`white-space: nowrap`), in
a `1fr` column that cannot shrink below its text. On a phone the row takes the title's full width.

## The fix

`ui/src/styles/trace.css`, at phone widths: the problem row's middle column may shrink (`minmax(0, 1fr)`) and its title
wraps.
