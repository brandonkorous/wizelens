# 198 — The service map is one picture to a screen reader, so its boxes and arrows cannot be used

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, scoring pass (in-app Services on eShop, P03's app)
**Surface:** Services › dependency map, in-app and cloud
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at in-app Services, 1440 light and 360 light and dark, 18:48

## What happened

The map's boxes are buttons (show this service) and its arrows are links (open the called service). The map itself
was marked as one image. A screen reader treats everything inside an image as part of the picture, so it read
"Service dependency map, image" and skipped every button and link in it. axe: nested-interactive.

## Where it lives

`js/packages/ui/src/pages/services/DependencyMap.tsx`, the `<svg role="img">`.

## Fix

The map is a named group, not an image. Each box and arrow keeps its own name ("Show Web", "Open PublicApi").

## Confirmation

- 18:48, Ifeoma on eShop's in-app Services at 1440 and 360, light and dark: no axe fault; the map reads as a group
  with its boxes and arrows inside.
