# 194 — Stack traces and wide tables scroll, but the keyboard cannot reach them

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (Trace › Errors; Devices, Connect › options and Trace compare at 360)
**Surface:** Stack traces; every table wider than its box
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Trace › Errors, Devices, Connect › options, Trace compare, 360 light and dark, 18:26

## What happened

A stack trace is held to 260 px and scrolls, and on a phone a wide table scrolls sideways. Neither box took a Tab
stop, so someone on a keyboard could not read the rest. #156 fixed the same thing on the site, not in the dashboard.

## Where it lives

`js/packages/ui/src/ui/Table.tsx` and the two stack trace boxes in `pages/trace/`.

## Fix

`useScrollFocus` (`ui/scrollFocus.ts`) gives a box a Tab stop, the region role and a name ("Stack trace", "Table,
scrolls sideways", after the nearest heading so no two share a name) only while it scrolls, so short tables add
no stops. `StackBox` uses it for both stack traces.

## Confirmation

- 18:26, Ifeoma: no scrollable-region-focusable or landmark-unique fault on the 33 cloud screens in the four views;
  the stack trace and the wide tables take a Tab stop named after their panel.
