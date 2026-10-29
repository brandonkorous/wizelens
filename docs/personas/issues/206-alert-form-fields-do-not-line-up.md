# 206 — The new alert form's fields do not line up

**Status:** fixed
**Severity:** design
**Found by:** Brandon, cloud `#/alerts?new=1`
**Surface:** Alerts › New alert (and the SLO, dashboard panel and log rule forms)
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid on the local cloud, New alert at 1440 light and dark and at 360 light and dark: Metric, Condition, Threshold and Over the last share one top line; Remind while firing is as wide as Name; Rule is on sits beside it

## What happened

Metric, Condition, Over the last and Remind while firing had no label on screen, so they sat a label's height above
Threshold beside them. "On" sat alone beside a full-width reminder box, and at 360 it had a gap above it.

## Where it lives

The forms used the toolbar `Select` (name for screen readers only) instead of `SelectField`.

## Fix

Every drop-down in a form is a `SelectField` with its label. The check box is "Rule is on" and lines up with the field
beside it; the reminder row keeps the field at half width (`FormRow half`), full width on a phone.
