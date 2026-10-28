# 078 — The trace page says "browser" where every other page says "Web App"

**Status:** fixed
**Severity:** copy
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · scoring Trace (in-app and cloud)
**Surface:** Trace › header Services chips, and the service chip in the SQL, HTTP, Logs and Errors tabs and the span panel
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · Sid's admin save trace in the cloud; RULE #7 on a P02 Greta browser trace
**Blocked on:** —

## What happened

Sid opened the admin save trace from Services › Web App. The trace header lists its services as "PublicApi" and
"browser". Services, Requests, Errors and the service menu all call the same thing "Web App". Sid has to guess that
the two words are one service.

## What should have happened

The trace uses the same name as the rest of the dashboard: "Web App", or "shop (browser)" when the site names its app.

## Where it lives

`pages/trace/tabParts.tsx` `ServiceChip` prints the span's raw service name. Every other screen goes through
`webAppName` / `spanServiceName` in `core/src/web-app.ts`.

## The fix

`ServiceChip` takes the trace and names a browser span the way every other screen does (`spanServiceName`, else
`displayService`). All six chip places (header, SQL, HTTP, Logs, Errors, span panel) use it.

## Confirmed by

2026-10-27, by 20:36, cloud, Sid, trace `2d67f137…` (fetch /api/catalog-items): header Services reads "PublicApi" and "Web
App"; the SQL tab chips read "PublicApi", "Web App", "PublicApi", "PublicApi".

RULE #7, 2026-10-27, by 20:36, P02 Greta: Requests › Web App › first row › View full trace (`de171041…`): Services reads
"Web App".
