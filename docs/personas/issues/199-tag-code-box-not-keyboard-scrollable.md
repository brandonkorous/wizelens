# 199 — On a phone the tag rule code box scrolls sideways, but the keyboard cannot reach it

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (in-app Settings, Retention, Checks, Tags on eShop at 360)
**Surface:** In-app Settings › Add a tag, and the Tag this dialog's code boxes
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at in-app Settings, Retention, Checks and Tags, 360 light and dark, 18:48

## What happened

In the in-app dashboard, Settings shows the code for one more tag rule. At 360 the lines are wider than the box,
so it scrolls sideways. The box took no Tab stop, so a keyboard user could not read the end of the .NET line.
axe: scrollable-region-focusable. #194 fixed the same thing for stack traces only — the neighbour was left behind.

## Where it lives

`js/packages/ui/src/pages/organization/TagsSettings.tsx` and `ui/TagThis.tsx`, plain `<pre>` boxes.

## Fix

One shared `CodeBox` (in `ui/StackBox.tsx`) takes a Tab stop and a name only while its text scrolls. Stack traces,
the Add a tag note and the Tag this dialog all use it.

## Confirmation

- 18:48, Ifeoma on eShop at 360 light and dark: Settings, Retention, Checks and Tags have no axe fault.
