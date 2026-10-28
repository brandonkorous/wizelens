# 144 — `localhost:3001` sat in Services as its own Unhealthy service, with no word on what it is

**Status:** fixed (the row explains itself; folding it into kanninja-backend is not done, see below)
**Severity:** minor
**Found by:** P02, P03 (rating gap on Services); worked in the 7-score pass
**Surface:** Services › the Services table
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta at 1440 and 360, 09:10

## What happened

Greta's Services list `localhost:3001 · Unhealthy · 5 calls · 40%` under an "Outside service" globe, beside
`kanninja-backend`, which is the API on that port. The 5 are the web app's calls that no traced service answered
(2 of them while the API was down). The row looked like a sixth service she had never heard of.

## Fix

- `core/src/stats/in-cluster.ts`: `isLocalAddress` (localhost, loopback, private networks; test in `in-cluster.test.ts`).
- `ui/src/pages/services/serviceParts.tsx`: an outside-service row on a local address carries the line
  "Local address: no service you trace answered these calls".

Not done: moving those calls into the `kanninja-backend` row. The stored rollups do not keep which address a service
answered on, so old data could not be moved, and a guess by port would be wrong across machines.

## Confirmation

- 09:10, Greta (1440, and 360 touch): "localhost:3001 / Local address: no service you trace answered these calls ·
  Unhealthy · 5 · 2 · 40%". The other rows are as before.
