# 212 — On a phone the dependency map shows one box and cut labels

**Status:** fixed
**Severity:** minor
**Found by:** P06, `#/services` at 360
**Surface:** Services › Dependencies
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid at 360 dark: five calls listed, such as "Web App → Web · 10 calls · p95 103 ms", each linking to the service; no sideways scroll

## What happened

The map scrolled sideways inside its panel and showed one box with half a label.

## Where it lives

The map is an SVG as wide as its columns of boxes.

## Fix

Under 560 px the map is replaced by a list of its calls (`CallList` in `DependencyMap.tsx`).
