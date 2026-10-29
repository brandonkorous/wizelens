# 191 — In light mode, the Errors count, "Ctrl K" and the "Cloud · kept 14 days" badge are too faint to read

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (every cloud page, 1440 and 360 light)
**Surface:** Side menu, phone bar, top bar; every grey and red text in light mode
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at every cloud screen (33), 1440 and 360 light, 18:26

## What happened

The red "31" on Errors in the side menu is #e63946 on #fdecee: 3.65 to 1, under the 4.5 to 1 small text needs. The
grey "Ctrl K" and "Cloud · kept 14 days" in the top bar are #6b7280 on #f2f4f8: 4.39 to 1. The same red on white,
used for error text everywhere, is 4.0 to 1.

## Where it lives

`js/packages/ui/src/styles/tokens.css`: light `--wl-muted` and `--wl-error`.

## Fix

Light `--wl-muted` is #636a77 (4.94 to 1 on the top bar, more on white) and light `--wl-error` is #c1121f (5.46 to 1
on its soft red). Charts keep their own `--wl-red`.

## Confirmation

- 18:26, Ifeoma: the cloud sweep (33 screens, light at 1440 and 360) shows no contrast fault on the Errors count, "Ctrl K"
  or the mode badge; axe finds no color-contrast fault on any screen but Trace compare (fixed in #193 at 18:27).
