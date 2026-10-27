# 037 — My new health check never answered once, and Uptime said 10.30%

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 8 (standing check: numbers at the edges)
**Surface:** Cloud › Uptime (list and one check), and the hub's Uptime
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 8 — deleted the check ("Delete kanNINJA API health — every 60 s? It stops running, and its history and incidents are deleted." → Delete check, so #032 holds on Uptime), added it again on `/health`: Down, "Expected status 200-299, got 404 (failed twice in a row)", 24h / 7d / 30d **0.00%**, the hand count (Cloud › Uptime). core 455, hub uptime 9, cloud uptime 3 tests pass
**Blocked on:** —

## What Greta saw

She added `kanNINJA API health — every 60 s` on `http://localhost:3001/health` (the address in her notes; kanNINJA
answers on `/api/health`). Both runs failed: "Expected status 200-299, got 404 (failed twice in a row)". The list
said Down, and 24h, 7d and 30d all said **10.30%**. By hand: two runs, two failures, never up once, so 0%.

## Where it lives

`core/src/uptime/percent.ts` counts uptime from the check's `createdMs` (when it was saved). The first run
comes at the next background round, up to 15 s later in the cloud; the incident starts at that first failed run,
so the wait before it counted as up. Nothing watched the URL in that time.

## Fix

- `core/src/uptime/state.ts` `lastRunOf(check, run)`: a check's first run moves `createdMs` to that run, so
  uptime counts only time a run has seen. `createdMs` is used for nothing else.
- The cloud (`repo/uptime.ts`) and the hub (`uptime/store.ts`) save it with the run.
- `uptime.test.ts`: a check whose first run fails is 0%, and later runs leave `createdMs` alone.
- Checks that already ran keep their old start.
