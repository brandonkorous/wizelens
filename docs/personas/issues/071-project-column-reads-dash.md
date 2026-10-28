# 071 — In one project, "Sending to this project" has a Project column of dashes

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 11
**Surface:** Services › Sending to this project (cloud)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 11 · cloud Services
**Blocked on:** —

## What happened

Both services send to "Ashgrove & Peña — Online Store" with that project's keys, yet the Project column read "–" on
each row: it shows only a project the service names itself (WIZELENS_PROJECT) or the All projects label.

## What should have happened

No column that is blank on every row. The panel title already says "this project".

## The fix

`RegistryPanel` shows Project only when some row has one (All projects, or a shared hub with WIZELENS_PROJECT).

## Confirmed by

2026-10-27 19:51, cloud Services: the table reads Service, Status, Environment, Hosts, Sends with, Runtime, Last seen.
