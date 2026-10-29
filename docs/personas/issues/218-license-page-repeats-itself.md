# 218 — The license page says its first sentence twice and its tabs wrap

**Status:** fixed
**Severity:** copy
**Found by:** P06 at 360, site `/license/`
**Surface:** site legal pages
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid at 360 in light and dark: four legal tabs on one line; the page opens with the plain words, then The packages

## What happened

The lede and the first paragraph were the same sentence, then a long block of mono package names came before the plain words. The four legal tabs wrapped, leaving License alone on a second line.

## Where it lives

`site/content/legal/license.md` and `.wl-legal-nav` in `docs.css`.

## Fix

The repeat is gone; In plain words comes first, the table under its own heading. Under 480 px the tabs stay on one line with tighter padding.
