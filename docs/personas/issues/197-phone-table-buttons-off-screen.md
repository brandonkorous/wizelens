# 197 — On a phone, Change access, Disconnect, Revoke and Delete sit off the right edge of their table

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, scoring pass (People › Project access, Connected apps, Organization › Projects at 360)
**Surface:** Every table with a buttons column, at 720 px and below
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at People › Project access, Connected apps, Organization › Projects, 360 light and dark, 18:30

## What happened

At 360 the Project access table showed Project and Own roles; "Change access" was past the right edge, with nothing
to say it was there. Connected apps hid "Disconnect", and Organization › Projects hid Rename, Access, Clear data and
Delete. The one thing a person came to do was the one thing they could not see.

## Where it lives

`js/packages/ui/src/styles/layout.css` (`.wl-cell-actions`) and `ui/Table.tsx`. Tags and Uptime's button columns did
not carry the class.

## Fix

At 720 px and below the buttons column, and its blank header, stick to the table's right edge with a soft shadow;
the other columns scroll under it. Tags and Uptime's button columns use the class too. Blank headers that are not
buttons (Shared, Change, New, State) now tell screen readers their own name, not "Actions" (#195).

## Confirmation

- 18:30, Ifeoma at 360: Project access shows each project with "Change access" beside it, header and rows lined up;
  Organization › Projects shows Rename, Access, Clear data and Delete in dark; Connected apps shows Disconnect. No
  axe fault on the three screens.
