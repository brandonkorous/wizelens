# 200 — On a phone, a detail page's Tag this button is cut at the card's right edge

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (in-app User detail on eShop at 360)
**Surface:** Every detail page header with links and buttons (User, and any other `DetailHead` with row actions)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at in-app User p03.sid@ashgrovepena.test, 360 light and dark, 18:53

## What happened

User detail's header holds Requests →, Errors →, Logs → and Tag this. At 360 they sat on one line that does not
wrap, so Tag this ran past the card's edge and showed as "Tag thi".

## Where it lives

`js/packages/ui/src/styles/pages/cloud.css` sets `.wl-row-actions` to `white-space: nowrap`, made for table rows.

## Fix

Inside a page header (`.wl-dhead-actions`) the row wraps to a second line. Table rows keep their one line.

## Confirmation

- 18:53, Ifeoma on eShop's in-app User detail at 360, light and dark: the three links on one line, Tag this whole on
  the next; no axe fault.
