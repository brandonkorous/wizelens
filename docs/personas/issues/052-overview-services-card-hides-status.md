# 052 — My database's long name pushes Status and Latency out of the Services card

**Status:** fixed
**Severity:** design
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 3
**Surface:** In-app (.NET) › Overview › Services card
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 3 · Overview
**Blocked on:** —

## What happened

Sid opened `https://localhost:5001/_wizelens/` at 1440 px. The Services card lists
`Web` and `microsoft.sql_server · Microsoft.eShopOnWeb.CatalogDb`. The header reads
"Service" and "Stat"; each row shows a green dot and "H". "Avg Latency" and
"Requests (24h)" are not in view. Nothing says the table scrolls sideways.

## What should have happened

The four columns fit the card. A long name is cut with "…" and shown in full on
hover, as on the Recent Requests card beside it and the Services page.

## How to reproduce

1. eShopOnWeb on .NET 8 with WizeLens and `UseSqlServer(...).UseWizeLens()`.
2. Load the store home once, then open `/_wizelens/` at 1440 × 900.
3. Every time: the table is 753 px wide inside a 466 px box.

## Why it matters

The card exists to say if each service is healthy. With the name this long, the
health word and the numbers are hidden. EF Core names every SQL Server database
this way, so most .NET users see it.

## Where it lives

`js/packages/ui/src/pages/overview/ServicesPanel.tsx`: the name column has no width
limit, and `.wl-truncate` cannot shorten text in an auto-width table cell. The
Recent Requests card (`.wl-ov-path`, 260 px) and the Services page
(`.wl-svc-ep-name`) each set a limit of their own.

## The fix

One shared rule in `styles/ui.css`: a `wl-fill` column takes the free width (`width: 100%; max-width: 0`), never
narrower than 14ch, and its `.wl-truncate` text ends in "…" (icon and tagged cells too). Cell icons keep their
size (`flex: none`). `ServicesPanel.tsx` marks the name column `wl-fill`; the full name stays in the hover title.

## Confirmed by

2026-10-27, P03 Sid, eShop on .NET 8, `https://localhost:5001/_wizelens/`: at 1440 the table is 466 px in its 466 px
box; Service, Status, Avg Latency and Requests (24h) all show, the database reads "microsoft.s…" with its icon at
full size. Dark the same. At 360 "Web" reads in full and the long name ends in "…"; Requests (24h) scrolls
sideways as before (recorded on the rating row).
