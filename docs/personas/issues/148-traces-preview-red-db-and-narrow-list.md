# 148 — Traces: database time painted red, a list a third of the page, and "1 spans … This trace has no spans"

**Status:** fixed
**Severity:** minor
**Found by:** P01, P02, P03 (rating gaps on Traces); the empty preview found by P02 Greta in this pass
**Surface:** Traces (list and Trace Timeline preview)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P02 Greta at 1440, 09:21

## What happened

- The preview painted the database layer `--wl-red`, the error color, on traces where nothing failed (P03's eShop
  traces read as failing). Every other screen paints database time amber.
- At 1440 the list got a third of the width: `/dojo/c2be23b0…/board?_rsc=…` took five lines a row.
- A React render-count trace showed "1 spans" in its chip and "This trace has no spans." under an axis of 0–1.0 ms.

## Fix

- `styles/pages/traces.css`, `TraceSidePanels.tsx`: database layer `--wl-k-db` (amber), outside calls `--wl-k-client`
  (slate), as on the trace page; red stays for failures.
- `styles/pages/traces.css`: the list takes 1.1 parts to the preview's 1 (at least 420 px).
- `LayerTimeline.tsx`: "1 span"; with nothing to draw there is no axis, and the panel says why: "This trace holds React
  render counts, not timed work. Rendering lists them under Component Hotspots." (with a link).

## Confirmation

- 09:21, Greta at 1440, Traces with `dojo`: the list is 598 px wide (was about 440) and the long row 79 px tall (was
  about 140); the render-count trace reads "1 span" and the sentence above, with no axis.
- 09:22, the layer colors on the page: database rgb(244, 180, 0), the same as the trace page's database; outside calls
  rgb(100, 116, 139); errors stay rgb(230, 57, 70). No database bar was in the first 8 backend traces, so the bar
  itself was not seen on a trace.
