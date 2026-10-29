# 189 — Switching project keeps the other project's service filter, and the pages read as empty

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, scoring pass (Traces, after moving from Hälsa to Ostrava)
**Surface:** Project menu; every page with the Services filter
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Traces, 1440 light, 17:39

## What happened

With `halsa-booking-api` picked as the service, Ifeoma switched the project to Ostrava Bikes. The filter stayed on
`halsa-booking-api`, a service of the other project, and Traces read "Selected Traces 0 … No traces in this time
range yet." Ostrava had 173 traces. The page presented a filter mismatch as "no data".

## Where it lives

`js/packages/ui/src/data/prefs.ts` (`setProjectScope`) and `js/packages/ui/src/shell/HubMenu.tsx` (the project choice
set the project pref directly).

## Fix

Every project switch goes through `setProjectScope`, and a new project clears the service filter. A link that names both
a project and a service still opens with both.

## Confirmation

- 17:39, Ifeoma: Hälsa, then Ostrava in the project menu: Traces shows "All Services" and "Selected Traces 173".
