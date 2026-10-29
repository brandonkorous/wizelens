# 157 — Pricing: plans that do not fit are faded past reading, and cost bars have a label screen readers drop

**Status:** fixed
**Severity:** design
**Found by:** P06 Ifeoma, act 2 (Pricing)
**Surface:** Site › Pricing: the calculator and the total cost bars
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 and 360 light, 15:57

## What happened

In the calculator, a plan that does not fit the slider's amount was drawn at 55% opacity. Its name and price failed
contrast (axe `color-contrast`, 3 places): faded text used to show "not this one". The total cost bars put an
`aria-label` on a plain element, which screen readers ignore (axe `aria-prohibited-attr`), so the part names were lost.

## Where it lives

`site/src/styles/pricing.css` (`.wl-pc-off { opacity: 0.55 }`) and `site/src/sections/pricing/TotalCost.tsx`.

## Fix

A plan that does not fit sits on the paper color with its name and price in the muted color, at full contrast. Each
cost bar part is `role="img"` with its label.

## Confirmation

- 15:57, Ifeoma: axe on Pricing is clean at 1440 and 360; the plans that do not fit read in full colour on a paper fill.
