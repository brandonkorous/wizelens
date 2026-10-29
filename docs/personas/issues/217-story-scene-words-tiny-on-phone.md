# 217 — The story page's scene labels are about 7 px on a phone

**Status:** fixed
**Severity:** minor
**Found by:** P04 at 360, site `/story/`
**Surface:** site story scene
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid at 360 in dark: "React app", "gateway", "orders" read clearly in the split scene, and the timeline rows read in the folded scene

## What happened

The scene is drawn 600 units wide and shrinks to about half on a phone, so its 14 px labels showed at about 7 px: three tiny chips and no words.

## Where it lives

`site/src/styles/story.css` sized the SVG text once for every width.

## Fix

At 600 px and less the scene's labels are drawn at 21 px (about 11 px on screen) and the stage padding is smaller.
