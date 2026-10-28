# 127 — Marisol set the hub and the key, restarted, and nothing ever arrived

**Status:** fixed
**Severity:** major
**Found by:** P05 · Kaweah Valley Credit Union · act 5, keys for Loan Desk API and Member Portal
**Surface:** Connect › Setup steps; the Node and .NET add-ons at start
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol, Connect › Setup steps and Services at 1440, 02:30–02:31

## What happened

Marisol made one sending key per project and the vendor's staging servers set exactly the step 2 block:
`WIZELENS_HUB`, `WIZELENS_HUB_TOKEN`, `WIZELENS_RELEASE`, `NODE_ENV=production`. Both services started and answered
staff requests. A minute later Services still said "No service has sent data yet". Nothing in the services' logs, nothing
in the cloud's log. The one sentence that explains it, "In production, also set WIZELENS_ENABLED=true", sits after the copy
block, in step 3's small note, so the copy-and-paste block was the trap.

## Why

Both add-ons are off by default in production (correct: an app does not start tracing unasked). But with a hub and a
key set, the person has clearly asked, and the add-on stayed silent about why it was not sending.

## The fix

- `ui/src/pages/connect/SetupSteps.tsx`: `WIZELENS_ENABLED=true` is a line in the step 2 block, labelled "In production the
  add-on is off until this is set; then it sends only and serves no dashboard". The note under step 3 is gone.
- `node/src/disabled.ts`: off only by the production default while a hub is set, the add-on prints
  `[wizelens] Off in production, so nothing is sent to <hub>. Set WIZELENS_ENABLED=true to send.` Test in `send-only.test.ts`.
- `dotnet/src/WizeLens.AspNetCore/WizeLensExtensions.cs`: the same warning through the app's logger. Test in `SendOnlyTests.cs`.

## Confirmation

- 02:30, Marisol, Connect › Setup steps: step 2 lists `NODE_ENV=production` and then `WIZELENS_ENABLED=true` with its label.
- 02:31, both services restarted with that block; Services shows `loan-desk-api · Loan Desk API` and
  `member-portal · Member Portal (staging)` Healthy, each with its sqlite database, "2 of 2 online", 27 traces kept.
- The start-up warning is proved by the add-on tests (Node 8/8, .NET 11/11 on net8.0 and net10.0); the services here run
  the npm build, which is older than the fix.
- Rule 7, 02:32, P02 Greta (p02mac), Connect › Setup steps: the same new line shows.
