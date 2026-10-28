# 077 — On the Services map, a call that skips a box is hidden behind it

**Status:** fixed
**Severity:** minor
**Found by:** P03 · RULE #7 re-check of #076 on P02 Greta's cloud Services
**Surface:** Services › Dependencies map (in-app and cloud)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P02 Greta's cloud Services (30 days), light and dark
**Blocked on:** —

## What happened

Greta's map shows Web App → kanninja-frontend → kanninja-backend. The browser also calls kanninja-backend directly
(373 calls, p95 346 ms), but that line runs straight behind the kanninja-frontend box, and its numbers sit under the
box too. On the screen there is no sign that the browser calls the backend at all.

## What should have happened

Every call has a line you can see and numbers you can read.

## Where it lives

`pages/services/DependencyMap.tsx`: a line is one curve from the caller's box to the called box. When the two are
more than one column apart, the curve passes through the boxes in the columns between, which are drawn on top.

## The fix

A call that skips a column runs in its own lane under the boxes it passes (14 px below the lowest of them, one lane
per such call), and its numbers sit just under that lane.

## Confirmed by

2026-10-27, by 20:32, cloud Services as Greta, last 30 days, light and dark: Web App → kanninja-backend is a grey line
that dips under the kanninja-frontend box and rises into kanninja-backend, labelled "373 · p95 346 ms" under the
frontend box. The other four lines and numbers are unchanged.
