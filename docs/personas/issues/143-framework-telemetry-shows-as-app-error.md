# 143 — Next.js's own telemetry call showed up as a kanninja-frontend error

**Status:** fixed (proved by test; screen re-proof not possible here, see below)
**Severity:** minor
**Found by:** P02 Greta (rating gap on Error group); worked in the 7-score pass
**Surface:** Errors, Error group (data from `@wizeworks/lens-node`)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** test only

## What happened

Greta's Errors list holds "TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal.
fetch POST https://telemetry.nextjs.org/…" under kanninja-frontend. It is Next.js, in dev, calling its own telemetry
service. True, but not the app's error: it sits in her list beside the real ones and she can do nothing about it.

## Fix

New `node/src/tool-telemetry.ts`: a span whose host (address, URL, or a Next.js "fetch POST <url>" name) is a
framework's own telemetry host (`telemetry.nextjs.org`) is not recorded. `processor.ts` skips it, as it skips served
files. Test in `processor.test.ts`: the Next.js-named span and the `url.full` span are dropped, an app call is kept.

## Confirmation

- `processor.test.ts`: 5 of 5 pass.
- Not re-proved on a screen: the only Next.js app in the runs is kanNINJA, which this work may not touch, and the
  stand-in apps are plain Node. It shows on screen once an app runs a release of `@wizeworks/lens-node` with this fix.
  Greta's old group from Oct 27 stays until she ignores it.
