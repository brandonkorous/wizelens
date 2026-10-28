# 150 — Local Connect showed each setting but not the option that changes it

**Status:** fixed
**Severity:** minor
**Found by:** P01 (rating gap on Connect: "read-only: every setting is code")
**Surface:** Connect › This service (in-app dashboard)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P01-style local dashboard (this worktree's lens-node on 5977) at 1440 and 360, 09:27

## What happened

The in-app dashboard reads its settings from the app's code, by design: a page anyone on the dev port can open must
not rewrite the app's setup. But only MCP and response bodies said which option turns them on. For Storage, Max traces,
Keeps data for, Sampling, Slow query and N+1 threshold, the reader had to find the row in the Add-on options table.

## Fix

`ui/src/pages/connect/SourceSettings.tsx`: in an in-app service, each of those rows ends "· set with `<option>`", named
as the service's own stack writes it (`SlowQueryMs` for .NET, `slowQueryMs` for Node).

## Confirmation

- 09:26, a Node app with `slowQueryMs: 75, maxTraces: 2000` on 5977: "Max traces 2,000 · set with maxTraces", "Slow
  query 75 ms or more · set with slowQueryMs", "Keeps data for 1 day · set with maxAgeMs", "Sampling Every trace · set
  with sampling.rate", "N+1 threshold 5 repeats · set with nPlusOneThreshold"; MCP and bodies keep their "Turn it on" lines.
- 09:27 at 360: the hints wrap under the value and nothing runs off the card. Dark not seen on this profile.
- .NET names not seen on screen (no .NET app on this build); they come from the same table as Add-on options.
