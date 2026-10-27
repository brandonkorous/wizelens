# 043 — The four minutes my API could not send look like four quiet minutes

**Status:** fixed
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 10
**Surface:** Cloud › Services › one service (Requests Over Time), and every request-count chart
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 10 — cloud rebuilt and restarted on migration 29; the kanNINJA API was stopped 13:01:22 to 13:05:00 UTC (no batches, no heartbeats). Greta picked Last hour on Services and opened kanninja-backend: the side panel Traffic chart carries one red band at 6:01 AM; View full service: Requests Over Time and Latency Over Time each carry the band, the request line breaks there instead of drawing 0, and the note reads "Red bands: kanninja-backend sent nothing, not even a heartbeat (it stopped, or its key was refused). Its requests there are unknown, not zero." Seen in light, dark and at 360 px, no sideways scroll (Cloud › Services › one service)
**Blocked on:** — (decided 2026-10-27: do it)

## What Greta saw

She revoked `kanninja-backend (API pods)` at 10:29:40 UTC and the API's data came back at 10:33:28 with a new
key. Dani opened the board during the gap. Services said kanninja-backend "Offline", which is right. But the
service page's Requests Over Time drew a flat **0** from 3:29 to 3:33 AM, the same line as a night with no
users. Latency Over Time showed a break there. A person reading the request chart tomorrow would say "nobody
used the board", which is false: the requests happened and were not recorded.

## Where it lives

The cloud keeps only `last_seen` per service (`cloud/src/db/schema.ts`, `repo/services.ts`). An empty batch
is a heartbeat (`core/src/hub.ts`), but no history of heartbeats is kept, so a count chart cannot tell
"sent nothing because idle" from "could not send". Count series fill empty buckets with 0.

## What it would take

- Keep a per-service, per-minute "seen" row from each batch and heartbeat (a migration in `cloud/src/db`).
- Time-series reads return no value (not 0) for buckets where the service was not seen; charts draw a
  break and a band "Not sending" for them.
- Optional: count ingest calls refused with a revoked key per key, and show "A revoked key tried to send
  12 times" on Connect › Sending keys.

## Fix

Brandon: do it (2026-10-27).

- Migration 29 (`cloud/src/db/schema-seen.ts`): `service_minutes`, one row per service, environment and minute it sent
  anything (a batch or a 10 s heartbeat), with the org stamp and the reader row policy like every telemetry table.
- `cloud/src/repo/service-minutes.ts`: `noteMinute` on every batch (one insert a minute per sender, from
  `writeService`); `sendGaps` finds two or more minutes with nothing, and one still open; `pruneServiceMinutes` keeps
  them as long as the project keeps traces (a housekeeping job); deleting a project deletes them.
- `GET api/projects/<id>/service-gaps?service=&from=&to=&env=` (`routes/service-gaps.ts`).
- The service page (cloud, one project) draws each gap as a red band on Requests Over Time and Latency Over Time,
  and says under the request chart that the counts there are unknown, not zero (`useSendGaps.ts`, `ServiceCharts.tsx`).
- Not built (the optional part): counting calls refused for a revoked key. Revoked keys are kept (`revoked_ms`) but no
  screen lists them, so it needs a "Revoked keys" list on Connect first. The gap band shows the effect where Greta looked.
- Test: `service-gaps.test.ts` (heartbeats, 4 silent minutes, one late minute that is no gap, a gap still open).
