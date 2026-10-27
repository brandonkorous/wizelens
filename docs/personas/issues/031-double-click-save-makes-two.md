# 031 — Double-clicking "Save alert" made the same alert twice

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 7 (standing check: wrong moves)
**Surface:** Cloud › Alerts › New alert, and every form that creates something
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 7 — made `Slow SQL on the board load (≥ 250 ms)` again and double-clicked "Save alert": the Rules table lists it once (Cloud › Alerts)
**Blocked on:** —

## What Greta saw

She double-clicked "Save alert" on `Slow SQL on the board load (≥ 250 ms)`, the way people do on a slow
connection. The Rules table then listed that rule twice. Each copy would fire and email her on its own, so
one slow query means two emails, and muting one does not mute the other.

## Where it lives

The create forms send their save on every submit: nothing stops a second one while the first is on its way,
and the button stays enabled. A React `busy` state alone is not enough, because both clicks arrive before
it re-renders. Same shape in the SLO, uptime check, key, project, saved search, dashboard, saved view and
SCIM token forms.

## Fix

- `ui/src/ui/useOnce.ts`: one save at a time, guarded by a ref; `busy` disables the button.
- Used by `AlertForm`, `SloForm`, `CheckForm`, `KeyForm`, `NewProjectForm`, `LogMetrics` SaveForm,
  `DashboardsPage` new dashboard, `SaveView`, and `ScimSection` TokenForm. Settings forms that PUT the same
  values (thresholds, retention, organization name) are safe to send twice and are left as they are.
