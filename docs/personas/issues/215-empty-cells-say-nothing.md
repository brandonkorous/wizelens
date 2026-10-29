# 215 — Empty cells and zero cards say nothing about why

**Status:** fixed
**Severity:** copy
**Found by:** P04 and P06, Rendering, Requests, Problems
**Surface:** Rendering › By device, Requests › panel, Problems
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid: Problems at 360 shows the learning note and the empty list with no zero cards; a 302 request's panel says why Rendering is empty; the By device table says "No views"

## What happened

Phone and Tablet were all dashes; a request said "Rendering –" though the page had a render time elsewhere; Problems showed four zero cards before an empty list.

## Where it lives

Each cell or card fell back to a dash or zero with no reason.

## Fix

Device cells say "No views"; the request panel says Rendering and Network come from a joined page view and when there is none; Problems hides the cards when all four are zero.
