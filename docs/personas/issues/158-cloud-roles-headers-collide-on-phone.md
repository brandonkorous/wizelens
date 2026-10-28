# 158 — On the Cloud page at phone width, the role names run into each other

**Status:** fixed
**Severity:** design
**Found by:** P06 Ifeoma, act 1 (Cloud at 360)
**Surface:** Site › Cloud: Roles that make sense
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 360 light, 15:57

## What happened

At 360 px the roles table head read "ViewerMembeAdmin Owner": four 12 px names in columns too narrow for them. The
first column had no name either (axe `empty-table-header`).

## Where it lives

`site/src/styles/cloud.css` (`.wl-ct-roles-row` grid) and `site/src/sections/cloud/tiles/TeamTiles.tsx`.

## Fix

Under 480 px the four role columns get more of the width and the gaps shrink; the first column is headed "Can".

## Confirmation

- 15:57, Ifeoma: on Cloud the roles header reads "Can · Viewer · Member · Admin · Owner" with no overlap; the dots line up under each name.
