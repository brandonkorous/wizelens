# 047 — On my phone the alert, SLO and key tables break words into single letters

**Status:** fixed
**Severity:** design
**Found by:** P02 · kanNINJA ops · scoring (360px)
**Surface:** Cloud › Alerts, SLOs, Connect › Sending keys (any table with a wrapping column)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 scoring at 360px on the rebuilt cloud — Alerts, SLOs and Connect › Sending keys: the Goal column reads "99.5% of / kanninja- / backend / requests / succeed, / over 30 / days", Projects reads "kanninja- / production", and the tables scroll inside their panels (page overflow 0) (Cloud › SLOs, Alerts, Connect › Sending keys)
**Blocked on:** —

## What Greta saw

At 360px the Rule column on Alerts read "Erro / r / rate / of / kan / ninj / a- / bac / ken / d", one short line
under the other, about 30 lines tall. SLOs did the same to the Goal column ("99.5 / % / of / kan / ninj …"),
and Sending keys split "kanninja- / producti / on".

## Where it lives

`ui/src/styles/ui.css`: `.wl-table .wl-wrap { word-break: break-word; }`. That value lets the browser break
inside any word when it sizes the table, so a wrapping column could shrink to one letter instead of the table
scrolling inside its box.

## Fix

`.wl-table .wl-wrap { overflow-wrap: break-word; min-width: 12ch; }`: words break only when one word alone is
too wide, and a wrapping column keeps at least 12 characters. The table scrolls sideways inside its panel.
