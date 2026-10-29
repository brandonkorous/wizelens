# 159 — Screen readers hear two menus called "Docs" (and two called "Legal"), and two tables have a blank header

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 2 and act 3 (axe)
**Surface:** Site › docs pages and legal pages; docs home and Python
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 light, 15:58

## What happened

axe `landmark-unique` on every docs page and every legal page: the docs sidebar and the footer's docs links were both
a navigation called "Docs"; the legal side menu and the footer's legal links were both "Legal". A screen reader user
picking a menu by name gets two the same. The docs home "Three ways to run it" table and Python's "What the package
adds" table had an empty first header (axe `empty-table-header`), and so did the Cloud page's "Same dashboard. Pick
the size." table.

## Where it lives

`site/src/components/docs/DocsSidebar.tsx`, `site/src/components/legal/LegalPage.tsx`,
`site/content/docs/index.md`, `site/content/docs/python.md`, `site/src/sections/cloud/Compare.tsx`.

## Fix

The side menus are "Docs pages" and "Legal pages". The two docs tables' first columns are "Where it runs" and
"What"; the Cloud table's is "Feature" for screen readers.

## Confirmation

- 15:58, Ifeoma: the side menus are "Docs pages" and "Legal pages"; the docs home table starts "Where it runs"; axe is clean on Docs and Python; the Cloud table's only axe hit is a demo line caught mid fade-in, clean at rest.
