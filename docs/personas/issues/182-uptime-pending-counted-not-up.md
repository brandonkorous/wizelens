# 182 — Uptime counts checks that have not run yet as "not up"

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 7 (adding the Hälsa checks for the status page)
**Surface:** Uptime
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Uptime, 1440 light, 17:20

## What happened

Right after saving two new checks, before either had run, the Checks Up card read "0 of 2 · 2 not up". The rows said
"Pending" and "Not yet". The card turned an unknown into a failure: an on-call lead reads "2 not up" as an outage.

## Where it lives

`js/packages/ui/src/pages/uptime/UptimeCards.tsx`: the note counted every check that was not up.

## Fix

The note counts down checks and checks not run yet apart: "1 down, 1 not run yet", "2 not run yet", or "All up".

## Confirmation

- 17:20, Ifeoma: one check down (wrong URL), one just added: "Checks Up 1 of 3 · 1 down, 1 not run yet". After Run
  now: "3 of 3 · All up".
