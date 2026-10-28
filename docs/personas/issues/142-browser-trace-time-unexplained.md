# 142 — A page load read "Network and other 4.84 s" and nothing said what took the time

**Status:** fixed
**Severity:** minor
**Found by:** P02, P03, P04 (rating gap on Trace › Timeline); worked in the 7-score pass
**Surface:** Trace page, the split bar under the numbers
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 Noor at 390 light and 360 dark, 09:04; rule 7 P02 Greta 09:05

## What happened

A trace from Noor's static site has one span, the page view, and no server of hers. The split bar put all of it in
grey "Network and other", next to Server 0 ms, Database 0 ms and Render 0 ms. The page view span already holds the
browser's own times (host answered, text showed, main content showed, slowest picture), and the bar used none of them.

## Fix

New `ui/src/pages/trace/pageSplit.ts`: for a trace with no server whose root is a browser page view, the bar splits by
"Waiting for the host", "Until text showed" and "Until main content showed" (the Rendering page's words), with one line
under it on the slowest picture. `TraceHeader.tsx` uses it; other traces keep Server / Database / Render / Network.
Two colors in `styles/trace.css`.

## Confirmation

- 09:04, Noor (390 light; 360 dark touch), Traces › Slowest first › `pageview /blog/future-of-devsecops-from-pipelines-to-platforms`:
  "Waiting for the host 3.4 ms · Until text showed 1.56 s · Until main content showed 4.58 s" (sum 6.14 s = Total), then
  "No server of yours is in this trace, so the time is split by the browser's own clock. The slowest picture took 4.54 s to download."
- Rule 7, 09:05, Greta's slowest server trace: "Server code 33.2 s · Database 0 ms · Render 0 ms · Network and other 0 ms", no note.
