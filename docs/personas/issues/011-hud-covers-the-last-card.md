# 011 — The HUD sat on top of the last card in Dani's right-hand list, and could not move

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 7
**Surface:** HUD (the `wizelens-hud` card, bottom right of every kanNINJA page)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 7 — HUD Settings → "Show WizeLens bottom left", then deleted the last card in Done through its menu
**Blocked on:** —

## What happened

To delete `Re-sharpen planer knives (Hitachi, 3 × 310 mm)`, the last card of the
`Done` list, Dani opened its "Kata actions" menu. The HUD card (460 × 150 px, fixed
bottom right) covered it. The list was at its end, so scrolling did not help. The
only way through was "Minimize WizeLens" — and then the HUD was gone from every page.
Earlier in the run the open details panel had covered the board twice (acts 4 and 5).

## What should have happened

Dani keeps the HUD on screen and still reaches every part of their own app. Many
apps put controls bottom right (chat bubbles, toasts, "Add" buttons).

## Why it matters

A dev tool that blocks the app it measures gets minimized, then forgotten. Then
nobody sees the slow page.

## Where it lives

`js/packages/browser/src/hud/style.ts` — `.wl-hud{position:fixed;right:16px;bottom:16px}`,
no other place to put it. Settings (`hud/settings.ts`) offered only "Live".

## The fix

HUD settings got a second switch, **Show WizeLens bottom left** (`hud/settings.ts`), stored as `wizelens.hud.side`
(`hud/storage.ts` `writeLeft`), so it lasts across reloads and pages. `.wl-hud.wl-left` puts the card, the panels and
the minimized button at the bottom left (`hud/style.ts`). Bottom right stays the default. Test: `controller.test.ts`
"moves to the bottom left from the settings, and remembers it". Trade-off seen on screen: bottom left, Next.js' own
"N" dev button sits over the HUD's SQL count (Next.js can move it with `devIndicators.position`).

## Confirmed by

> Re-ran P01 act 7 in a second tab: HUD Settings → ticked "Show WizeLens bottom left" → closed. The HUD moved to
> x 16 (bottom left), and stayed there after a reload. The `Done` list's last card, `Re-sharpen planer knives (Hitachi,
> 3 × 310 mm)`, opened its "Kata actions" menu and "Delete kata" ran; `Done` went from 10 to 9.

## Rating effect

HUD (on the board) — Ease 7 → 8
