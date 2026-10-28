# 122 — Trace compare: "Total" adds the render to the call without saying so

**Status:** fixed
**Severity:** design
**Found by:** P01's gap on Trace compare (score 7), picked up in the 7-to-9 plan
**Surface:** Trace compare (`#/traces/<a>/compare/<b>`), the Numbers table
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta at 1440, 01:12

## What happened

For a trace that starts in the browser, Total is the browser call plus its render (`traceTiming`). The table said only
"Total", so 208 ms read as the call's time beside a Render row of 121 ms.

## What should have happened

The row says what it adds up.

## The fix

`ui/src/pages/trace/TraceCompare.tsx`: when either trace starts with a browser call, the row reads
"Total (call + render)"; server-only traces keep "Total".

## Confirmation

- 01:12, two of Greta's browser traces: "Total (call + render) 208 ms 209 ms +1.6 ms", then "Render 121 ms 121 ms".
- 01:12, two uptime traces of `/api/health`: "Total 1.0 ms 4.3 ms +3.3 ms".
