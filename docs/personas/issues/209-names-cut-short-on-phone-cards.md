# 209 — On a phone a list's name is cut after a few letters

**Status:** fixed
**Severity:** minor
**Found by:** P03, cloud `#/` Services panel at 360
**Surface:** Every list that reads as cards on a phone
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid at 360 light and dark: Overview Services shows "microsoft.sql_server · Microsoft.eShopOnWeb.CatalogDb" whole on two lines; the name cells measure 267 px, not 127 px

## What happened

A database name read "microsoft.s…" on the Overview, and on a phone names in many lists wrapped into a narrow column or were cut.

## Where it lives

The desktop rule `.wl-table td.wl-fill { max-width: 0; min-width: 14ch }` outweighed the phone card rule, so on a phone every fill column was pinned to 14ch (127 px).

## Fix

`styles/cards.css` resets the fill cell to the full card width; the Overview's service names wrap at their dots (`breakable`).
