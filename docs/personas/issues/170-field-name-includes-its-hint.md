# 170 — A form box's name includes its whole hint

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 6 (Organization › Tags › New tag)
**Surface:** every dashboard form box with a hint (`Field`, `TextArea`, `SelectField`): tags, alerts, uptime, SSO, keys
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Organization › Tags › New tag, 1440 light, 16:30

## What happened

The tag form's first box was named "Name Lowercase letters, digits, - and _. Search it with tag:name." and the
second "Search Anything that matches this search shows the tag…". A screen reader reads all of it as the name, and
a voice-control user who says "Name" does not reach the box. Found when the step "fill Name" could not find it.

## Where it lives

`js/packages/ui/src/ui/Field.tsx`: the `<label>` wraps the label, the box and the hint, so the hint became part of
the name.

## Fix

Each box is named by its label (`aria-labelledby`) and described by its hint (`aria-describedby`). One change in
`Field.tsx` covers every form that uses it.

## Confirmation

- 16:30, Ifeoma: the tag form's boxes read "Name" and "Search" to a screen reader; the hints are read after, as
  descriptions.
