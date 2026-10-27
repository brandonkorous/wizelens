# 043 — The four minutes my API could not send look like four quiet minutes

**Status:** open
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 10
**Surface:** Cloud › Services › one service (Requests Over Time), and every request-count chart
**Filed:** 2026-10-27
**Fixed:** —
**Confirmed by:** —
**Blocked on:** scope

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
