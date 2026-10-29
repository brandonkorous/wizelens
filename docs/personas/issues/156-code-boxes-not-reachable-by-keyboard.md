# 156 — Code boxes and wide tables cannot be scrolled with the keyboard

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 1 and act 3 (axe, every view)
**Surface:** Site › stack pages (code box); docs and License (tables)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 light, 15:57

## What happened

axe reported `scrollable-region-focusable` (serious) on every stack page's code box and on wide docs and License
tables. A keyboard user cannot reach them, so they cannot scroll to the rest of a cut line or column.

## Where it lives

`site/src/sections/stacks/CodeToTrace.tsx` (the `pre`) and `site/src/lib/docs/plugins.ts` (tables from Markdown,
also used by the legal pages). Docs code boxes already had `tabindex="0"` from Shiki.

## Fix

The stack code box and every Markdown table take focus (`tabIndex 0`).

## Confirmation

- 15:57, Ifeoma: on `/docs/go` every code box that scrolls sideways has `tabindex=0`, so Tab reaches it; docs tables too.
