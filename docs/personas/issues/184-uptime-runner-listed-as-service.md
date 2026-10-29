# 184 — The uptime runner shows as one of the project's services

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 7 (the detail pages, after adding the Hälsa checks)
**Surface:** Project menu; Services filter on Errors, Insights, Security, Logs; Services › senders
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Errors and the project menu, 1440 light, 17:24

## What happened

Once the Hälsa project had uptime checks, every Services filter offered "wizelens-uptime" next to
"halsa-booking-api", and the project menu listed "wizelens-uptime · wizelens-cloud 0.3.0-alpha.13" and counted
"2/2" services online. The runner is WizeLens calling her API, not one of her apps; picking it on Errors shows nothing.
The Services page and the stats already left uptime runs out (#153); these lists did not.

## Where it lives

`js/packages/core/src/registry.ts` (`groupServices`, used by the project menu and the senders list) and
`js/packages/ui/src/ui/ServiceSelect.tsx` (`useServiceNames`, the shared Services filter).

## Fix

Both leave out `UPTIME_SERVICE`. A link that already names it still shows it in the filter. Test:
`registry.test.ts`.

## Confirmation

- 17:23, Ifeoma: Errors › Services lists "All Services, halsa-booking-api".
- 17:24, Ifeoma: the project menu lists "halsa-booking-api · otlp go" only, and the chip reads "1/1".
