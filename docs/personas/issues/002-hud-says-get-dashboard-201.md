# 002 — The HUD said "GET /dashboard 201" after Dani made a board

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 3
**Surface:** HUD › card (status pill)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 3 — made a second board on kanNINJA Dashboard; HUD read GET /dashboard 200
**Blocked on:** —

## What happened

On kanNINJA's dashboard Dani clicked **Open a dojo**, named the board, and clicked
**Open dojo**. The board was made. The HUD card then read:

> WizeLens · GET /dashboard · **201**

The dashboard page was a 200. The 201 belongs to the POST that made the board, one
of the page's calls. Next to "GET /dashboard" it reads as the page's own status,
which a GET never returns.

## What should have happened

The pill shows the page's own status (200), unless one of its calls failed: then it
shows the failure (a 500 from a call is exactly what the card must not hide).

## How to reproduce

1. Sign in to kanNINJA at http://localhost:3000, open **Dashboard**.
2. **Open a dojo** → name `Q4 Workshop Fit-Out: Müller Kitchens, St. Agnes' Hall & the Tōkyō pop-up` → **Open dojo**.
3. Read the HUD pill: `201`. Every time a page makes a POST that answers 201.

## Why it matters

The pill is the first thing a developer reads. A status that is not the page's makes
them doubt the rest of the card. Cosmetic in effect, but it says something false.

## Where it lives

`js/packages/browser/src/hud/page-summary.ts` — `summarizePage` sets
`status: Math.max(...statuses)` over the page and all its calls.

## The fix

`summarizePage` shows the page document's own status; when any call failed (4xx / 5xx) it shows the worst
failure instead. A page with no document row (a route change) shows 200 once it has a time, as before. Test:
`page-summary.test.ts` "shows the page's own status unless a call failed". Siblings: the status pill is drawn
only from `req.status` (`card.ts` `statusPill`), so this is the single point.

## Confirmed by

> Re-ran P01 act 3 on kanNINJA's Dashboard: **Open a dojo** → `Tōkyō pop-up — counter front & ash slats` →
> **Open dojo**. The board was made (a POST answering 201); the HUD read `GET /dashboard` · `200`, 23 SQL, 4 Fetch.

## Rating effect

HUD › card — Ease 6 → 8
