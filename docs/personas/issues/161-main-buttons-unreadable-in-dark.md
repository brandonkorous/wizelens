# 161 — In dark mode, the main blue buttons are hard to read; red buttons in both modes

**Status:** fixed
**Severity:** design
**Found by:** P06 Ifeoma, act 4 (account screens, 1440 and 360 dark; axe)
**Surface:** every filled button in the dashboard: Sign in, Create account, Send the link, Save, Turn on, Delete…
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 and 360 dark, 15:51

## What happened

axe `color-contrast` (serious) on every account screen in dark: white text on the dark theme's blue `#5b8def` is
3.23:1, under the 4.5:1 that 14 px text needs. The same button is on every page that saves anything. The red
"danger" button is white on `#e63946` (light, 3.9:1) or `#ff6b74` (dark, worse).

## Where it lives

`js/packages/ui/src/styles/pages/cloud.css` (`.wl-btn-primary`) and `styles/pages/account.css` (`.wl-btn-danger`) fill
with the text accent (`--wl-accent`, `--wl-error`), which dark mode lightens for text, and hard-code `#fff`.

## Fix

New tokens `--wl-accent-fill` (`#2563eb`), `--wl-error-fill` (`#dc2626`) and `--wl-on-fill` (white), the same in both
themes: 5.17:1 and 4.83:1. Text links keep the lighter accent.

## Confirmation

- 15:51, Ifeoma: axe finds no colour-contrast problem on the 11 account screens in dark at 1440 and 360; the buttons are the same blue in both themes.
