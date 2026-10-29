# 193 — Tags, service chips, green "ok" text and status pills are too faint to read

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (Logs, Organization › Tags, Service endpoint, Connect › server, trace tabs)
**Surface:** Tags, service chips, the trace header's status pills
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Logs, Organization › Tags, Service endpoint, Connect › server, trace tabs, Trace compare, both themes, 18:27

## What happened

In dark, the first series color (#5b8def) on its tinted chip (#212a3c) is 4.44 to 1: the `client-ostrava` tag and
the `ostrava-shop` chip on every log line (21 on one screen) fall under 4.5 to 1. In light, 7 of the 8 tag colors
fail on their tint (3.2 to 4.4 to 1), and green "ok" text (#16a34a) is 3.29 to 1 on white, 2.97 on its badge. The
trace's "200" pill is white on #16a34a, 3.3 to 1; the orange and red pills were also under 4.5.

## Where it lives

`js/packages/ui/src/styles/tokens.css` (dark `--wl-s0`) and `styles/trace.css` (`.wl-pill-*`).

## Fix

Dark `--wl-s0` is #6f9cf3 (5.29 to 1). Each light series color is darkened, same hue, to 5.1 to 1 or more on its
tint; light `--wl-ok` is #157338 (5.36 to 1 on its badge). Pills fill with #15803d, #c2410c and `--wl-error-fill`,
each 4.8 to 1 or more with white text.

## Confirmation

- 18:26, Ifeoma: no color-contrast fault on the 33 cloud screens in dark (1440, 360) or light, except the SQL labels on
  Trace compare's timeline (#8a5c00 amber was #9a6700, 4.25 to 1).
- 18:27, after the amber change: Trace compare, Database and Organization › Tags are clean in light and dark.
