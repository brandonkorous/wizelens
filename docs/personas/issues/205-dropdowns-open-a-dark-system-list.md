# 205 — Drop-downs open a dark system list that does not look like the dashboard

**Status:** fixed
**Severity:** design
**Found by:** Brandon, cloud alerts form and filters
**Surface:** every drop-down in the dashboard (forms, filters, pagers, row actions, account emails, app consent)
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid on the local cloud: New alert's Metric and Over the last, Logs' Service filter (picked Web, only Web lines stayed), Account › Emails' two drop-downs; desktop light and dark, and the alert form at 360 light and dark

## What happened

The top bar's menus open a list in the dashboard's colors. Every other drop-down opened the system's own list, which
on Windows is often dark on a light page. Two kinds of drop-down on one screen.

## Where it lives

`ui/Controls.tsx` `Select` and `ui/Field.tsx` `SelectField` drew a native `<select>`; two pages drew their own.

## Fix

One `Dropdown` (`ui/Dropdown.tsx`, keys in `ui/useListbox.ts`): a button with the choice, and a list in the dashboard's
surface and ink in both themes. It opens under the button (over it when there is no room), sits inside an open dialog,
and works with arrows, Home, End, Page keys, a typed letter, Enter and Escape (Escape closes the list only). `Select`,
`SelectField`, Account › Emails and the app consent screen all use it; no `<select>` is left in the dashboard.
