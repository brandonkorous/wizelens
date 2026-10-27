# 006 — With the keyboard, Dani lost their place: the "Search queries…" box shows no focus ring

**Status:** fixed
**Severity:** design
**Found by:** P01 · kanNINJA web team · act 6 (without a mouse)
**Surface:** Dashboard › Database filters, and every page with a search box (`SearchInput`, 20 uses)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 6 keyboard path — Tab into Search queries… on Database; the frame shows the 2 px ring
**Blocked on:** —

## What happened

Keyboard only, from `http://localhost:3000/_wizelens/`: Tab ×10 to **Database**, Enter,
then Tab on. Every stop showed the 2 px blue ring — the five filters, **Reset**, the
cards — except stop 35, the **Search queries…** box. Focus was in it and nothing on
screen said so. A screen reader got no label either: the `<label>` wraps only an icon.

## What should have happened

The box's frame shows the same 2 px ring as every other control, and the box has a name.

## How to reproduce

1. Open any dashboard page with a search box (Database, Requests, Traces, Logs…).
2. Tab into the search box.

## Why it matters

Keyboard users lose their place on the one control they came to type in.

## Where it lives

`js/packages/ui/src/styles/ui.css` — `.wl-input input { … outline: none; }` turns the
ring off and `.wl-input` has no `:focus-within` rule (`.wl-drop` has one).
`js/packages/ui/src/ui/Controls.tsx` — `SearchInput` gives the input no `aria-label`.

## The fix

`.wl-input:focus-within` draws the same 2 px `--wl-accent` ring as `:focus-visible` (`ui.css`, like
`.wl-drop`), and `SearchInput` names its input from the placeholder (`aria-label="Search queries"`). One
component, so all 20 search boxes get both. The command palette's input keeps no ring: it is the only control
in its dialog.

## Confirmed by

> Re-ran P01 act 6: `#/database`, Tab, Enter (skip), Tab ×6 → `INPUT "Search queries"`; the box's frame showed the
> blue 2 px ring in the screenshot.

## Rating effect

In-app › Database — Design 7 → 8
