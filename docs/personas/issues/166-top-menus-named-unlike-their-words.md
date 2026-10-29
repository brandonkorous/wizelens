# 166 — Top bar menus are named differently from the words on them

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 6 (making a sending key per project from the project menu)
**Surface:** Cloud › top bar: project menu, account menu, time range; Trace › Share
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 and 360, 16:13

## What happened

The project menu shows "Ostrava Bikes — Django shop", but its name for a screen reader or voice control was
"Organization, project, environment, and connected services". The account menu shows "Ifeoma Castellanos-Lindgren"
and was named "Signed in as p06.ifeoma@…". Saying what is on screen ("click Ostrava Bikes") does nothing
(WCAG 2.5.3, label in name). Found when a step that picks the project by its name could not find the button.

## Where it lives

`js/packages/ui/src/shell/Menu.tsx`: the button set `aria-label` to its tooltip, which replaces the button's words.

## Fix

The button keeps the tooltip as `title` only. A button with words is named by its words, and the tooltip is its
description; an icon-only button (bell, star, share) is still named by the tooltip.

## Confirmation

- 16:13, Ifeoma: at 1440 the top bar buttons are named "Ostrava Bikes — Django shop 0/0", "Last 24 hours",
  "Notifications" and "Ifeoma Castellanos-Lindgren"; at 360, where only icons show, they keep the tooltip names. The
  project menu now opens by its project name.
