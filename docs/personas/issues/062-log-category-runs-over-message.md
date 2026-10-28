# 062 — On the Logs page the category runs over the message, so neither can be read

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 9
**Surface:** In-app dashboard (.NET) › Logs (also a service's Logs, and a trace's Logs tab)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 9 · Logs
**Blocked on:** —

## What happened

Sid searched the Logs page for "Updating quantity". Every row's Category, `Microsoft.eShopWeb.ApplicationCore.Services.BasketService`,
is drawn on top of the Message column: the screen shows "Microsoft.eShopWeb.ApplicationCo" and then the two texts
printed over each other, "Updating quantity of item" unreadable. Every .NET category is a long namespace
(`Microsoft.EntityFrameworkCore.Database.Command`, `Microsoft.Hosting.Lifetime`).

## What should have happened

The category stays in its column, and the part that names it ("BasketService") is the part he sees.

## How to reproduce

1. eShop with WizeLens; any page; `https://localhost:5001/_wizelens/#/logs`. Every row at 1440 px.

## Why it matters

The log message is the point of the page and it is unreadable on every .NET (and Java) line.

## Where it lives

`js/packages/ui/src/styles/pages/logs.css` and `services.css`: `.wl-log-cat span { display: block }` — the cell
now holds a `<button>` (the "only this category" filter), so the truncate rule no longer applies and the button
overflows its 160 px column.

## The fix

- `styles/pages/logs.css`, `services.css`: `.wl-log-cat > *` is a block as wide as the column, so the name ends in
  "…" whatever element holds it.
- `pages/logs/LogParts.tsx` `shortCategory`: a dotted category shows its last two parts (`Services.BasketService`,
  `Database.Command`); the full name is on hover, and the filter still uses it. The trace's Logs tab
  (`trace/LogsErrorsTabs.tsx`) uses the same. Checked: a service's Logs table uses the same columns.

## Confirmed by

2026-10-27 19:10, P03 Sid, Logs → "Updating quantity": rows read `7:07:14 PM · Info · Web · Services.BasketService ·
Updating quantity of item ID:26 to 3. · POST /Basket/Checkout`; the category button ends at x = 747 inside its cell
(right edge 805).
