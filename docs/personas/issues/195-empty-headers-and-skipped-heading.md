# 195 — Screen readers hear blank column headers, and the trace's "Security risks" skips a heading level

**Status:** fixed
**Severity:** nit
**Found by:** P06 Ifeoma, scoring pass (People, Organization, Dashboards, Shared links, Devices, Trace compare; trace tabs)
**Surface:** Every table with a buttons column; the trace page
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at People, Organization, Dashboards, Shared links, Devices, Trace compare and the trace tabs, 18:26

## What happened

The last column of most tables holds buttons (Remove, Revoke, Sign out) and had an empty header, read as "blank".
On the trace page "Security risks" was a level 3 heading under the level 1 title, with no level 2 between.

## Where it lives

`js/packages/ui/src/ui/Table.tsx` (`HeaderCell`) and `pages/trace/FindingList.tsx`.

## Fix

An empty header says "Actions" to screen readers only. "Security risks" is a level 2 heading with the same look.

## Confirmation

- 18:26, Ifeoma: no empty-table-header or heading-order fault on the 33 cloud screens in the four views.
