# 076 — On the Services map, two call numbers print on top of each other

**Status:** fixed
**Severity:** design
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · scoring Services (in-app)
**Surface:** Services › Dependencies map (in-app and cloud)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · Services (in-app) light and dark; RULE #7 on P02 Greta's cloud Services
**Blocked on:** —

## What happened

Sid opened Services to see what eShop calls. Between Web/PublicApi and the two databases, "171 · p95 5.9 ms · 2.34%
failed" and "112 · p95 4.0 ms" print in the same place, so neither can be read. "96 · p95 1.12 s · 4.17% failed"
(Web App → PublicApi) runs under the Web box, which hides its middle. The red lines (calls that failed) are drawn 12 px thick and run straight through the numbers.

## What should have happened

Each line's numbers can be read, next to its own line.

## Where it lives

`pages/services/DependencyMap.tsx`: each label sits at the middle of its curve. Two curves that cross in the same
gap share that middle point. The gap between columns is a fixed 110 px, and a label with "failed" is about 170 px wide. `services.css`: `.wl-dep-edge.wl-failing path` paints both paths red, including the 12 px
transparent click area (`.wl-dep-hit`), which it outranks.

## The fix

The gap between columns grows to fit the longest label. Labels that would share a spot in one gap stack 14 px apart;
the upper one is the line from the upper box. Each label sits on a small box in the panel color, drawn after every
line. The click area rule now wins over the red line rule, so a failing line is 1.5 px again.

## Confirmed by

2026-10-27, by 20:31, https://localhost:5001/_wizelens/#/services, light and dark: "112 · p95 4.0 ms" (Web → Identity)
and "171 · p95 5.9 ms · 2.34% failed" (PublicApi → CatalogDb) sit one above the other, both readable; "96 · p95 1.12 s ·
4.17% failed" sits in the gap clear of the Web box; the red lines are thin and do not cross any number. Page width at
360: 360 (the map scrolls inside its panel).

RULE #7, 2026-10-27, by 20:31, P02 Greta's cloud Services (30 days): "74 · p95 55 ms · 9.46% failed" and "5 · p95 5.0 ms ·
40% failed" read clearly, one above the other. That map showed a different defect (#077).
