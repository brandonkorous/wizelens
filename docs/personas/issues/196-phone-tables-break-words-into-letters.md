# 196 — On a phone, docs tables squeeze a column until its words break every two letters

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (docs Configuration, Dashboard, Alerts, ASP.NET Core at 360)
**Surface:** Every docs and legal table at 720 px and below
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at docs › Configuration, Dashboard, Alerts, ASP.NET Core, 360 light, 18:13

## What happened

The Configuration table's Option column was two or three letters wide: "En / abl / ed", "Da / shb / oar / d",
"Sl / owQ / uer / yMs". Headers broke too ("Opt / ion", "Wher / e", "Un / it"). #155 let any letter end a line so
the last column would fit, and the browser then made the code column as narrow as one letter.

## Where it lives

`site/src/styles/prose.css`, the 720 px rule.

## Fix

No table cell on a phone is narrower than 7 em, and headers break only between words. Long code still wraps, in
pieces of about nine letters. Every column still fits 360 px (no sideways scroll on any of the four pages).

## Confirmation

- 18:13, Ifeoma at 360: Configuration reads "Enabled", "Dashboard", "Hud", "BasePath", "MaxTraces" whole;
  "WIZELENS_EN / ABLED" wraps once. Dashboard, Alerts and ASP.NET Core: headers whole, page width 0 over.
