# 088 — On a phone, Rendering zooms out and the bottom bar loses three tabs

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 4
**Surface:** Cloud › Rendering on a 390 px phone (and any page with a table that has a hidden column name)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 4 on Noor's phone at 21:47: Rendering is 390 px wide (was 1160), the text is full size, and the bottom bar shows all five tabs; Pages & Routes scrolls sideways inside its own box. Also 360 px (360 wide). RULE #7: P02 Greta's Requests, Database and Rendering have no table wider than the page (their remaining 21 px was #089).
**Blocked on:** —

## What happened

On her phone, Rendering is drawn 1160 px wide and shrunk to fit: the text is small, the page slides sideways, and the
bottom bar shows only Overview and Problems; Requests, Errors and More are off the screen. Pages & Routes has eight
columns, so it is wider than the phone, but it sits in its own side-scroll box. Something still reaches the page edge.

## What should have happened

The page stays 390 px wide. Only the wide table scrolls sideways, inside its box.

## Where it lives

The last column's name ("Issue count") is a screen-reader-only label, `.wl-sr-only`, placed with `position: absolute`.
Its box is positioned against the page, not the table's scroll box (`.wl-table-wrap` is not positioned), so it sits at
x = 1160 and stretches the page. Every table with such a header can do the same.

## The fix

`ui/src/styles/ui.css`: `.wl-table-wrap` is `position: relative`, so the hidden label stays inside the table's
scroll box. One rule covers every table.
