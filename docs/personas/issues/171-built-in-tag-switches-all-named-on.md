# 171 — The built-in tag switches are each named "On"

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 6 (Organization › Tags)
**Surface:** Organization › Tags › Built-in tags
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Organization › Tags, 1440 light, 16:30

## What happened

The three switches for the built-in tags (stream, probe, bot) were all named "On". A screen reader lists "On, On,
On", with no word for which tag each one turns off.

## Where it lives

`js/packages/ui/src/pages/organization/TagsSettings.tsx`, the "On" column.

## Fix

Each switch is named by its tag and state: "stream: On", "probe: On", "bot: Off". The word on screen stays "On" or "Off".

## Confirmation

- 16:30, Ifeoma: the built-in switches read "stream: On", "probe: On" and "bot: On".
