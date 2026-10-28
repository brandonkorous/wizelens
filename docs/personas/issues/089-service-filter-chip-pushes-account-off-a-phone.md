# 089 — On a phone, a service filter pushes the account button off the screen

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 4 (RULE #7 re-check of #088 on P02 Greta's account)
**Surface:** Cloud › every page's top bar, on a 390 px phone, while a service is chosen
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran on P02 Greta's account at 390 px with "Web App" chosen: the chip sits on its own line under the buttons, every button is 37–44 px and on screen, the account button at x = 341; Requests, Database and Rendering are all 390 px wide (were 411). P04 Noor, no service chosen: the bar is one row, as before.
**Blocked on:** —

## What happened

Greta had picked the service "Web App", so the top bar shows the chip "Web App ×". On a 390 px phone the bar then
needs about 450 px: the organization/project button is squeezed to 20 px under the calendar button, and her account
button sits at x = 384, past the edge. Every page is drawn 411 px wide and shrunk, so it slides sideways. Requests,
Database and Rendering all do it.

## What should have happened

On a phone, the chip moves to its own line under the buttons when they do not all fit. Every button keeps its size
and stays on the screen.

## Where it lives

`ui/src/styles/shell.css`: at 720 px and below, every top bar item except the search box is `flex: none`, and the bar
has one fixed-height row, so the chip (`ui/ServiceSelect.tsx` `ServiceChip`) takes room the other buttons need.

## The fix

`ui/src/styles/shell.css`, at 720 px and below: the top bar may wrap, and the service chip goes last (`order: 1`),
so it takes a second line only when the buttons do not all fit. The bar grows to fit; nothing below it uses its
height on a phone.

Second confirmation, 22:10: the wrap let the account button drop to a second line at 360 px when the buttons were 1 px
too wide. A 360 px phone now gets tighter gaps (`@media (max-width: 380px)`); at 360 the account button is on the first
line at x = 315 for Noor (no chip) and for Greta (with the chip on its own line).
