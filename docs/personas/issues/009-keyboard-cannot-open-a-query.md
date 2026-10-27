# 009 — Without a mouse, Dani could not open the slowest query: the rows never take focus

**Status:** fixed
**Severity:** major
**Found by:** P01 · kanNINJA web team · act 6 (without a mouse)
**Surface:** Dashboard › Database › Slowest Queries, and every clickable table row and list item
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 6 keyboard only — Database, skip, 17 Tabs to the first Slowest Queries row (ringed), Enter opened its query page; 20 keys in all
**Blocked on:** —

## What happened

On `http://localhost:3000/_wizelens/#/database`, Tab went through the filters, the
breakdown bars, **Export**, then only the **Endpoint** links of the 15 rows
(`/api/auth/*`, `/api/v1/boards/:boardId`, …), then the pager. The query rows —
the thing a click opens — were never focused. 60 Tabs, no way to open
`select "id", "name", "email", … from "auth_users" where "auth_users"."email" = $?`.

## What should have happened

Each row is a Tab stop; Enter opens it, like a click.

## How to reproduce

1. Open Database (or Requests, Errors, Services, any table whose row opens a page or a panel).
2. Tab through the table.

## Why it matters

The job "find the slowest query and open it" cannot be done by keyboard at all.
Same for the trace tabs' HTTP, Logs, Messages, SQL and Errors lists, and the
service map.

## Where it lives

`js/packages/ui/src/ui/Table.tsx` — `<tr onClick>` with no `tabIndex` or keys.
Hand-made copies: `pages/trace/HttpTab.tsx`, `LogsErrorsTabs.tsx` (row and error
item), `MessagesTab.tsx`, `SqlTab.tsx`, `pages/services/DependencyMap.tsx` (edges
and nodes). `ui/BarList.tsx` did it inline (Enter only).

## The fix

One helper, `ui/pressable.ts`: `tabIndex=0`, the click, and Enter or Space (only when the row itself has focus, so
a link inside keeps its own keys). Used by `Table.tsx` rows (every table with `onRowClick`), the trace tabs' HTTP,
Logs, Messages and SQL rows and the Errors items, the service map's edges and nodes, and `BarList` (which now also
takes Space). Rows and list items keep their own role. Not changed: `RecentTraces` rows, whose trace id is already a
link to the same place.

## Confirmed by

> Re-ran P01 act 6 without a mouse: `#/database`, Tab → Skip to content, Enter, Tab ×17 → the row
> `select "id", "name", "email", … where "auth_users"."email" = $?` (blue ring above and below), Enter →
> `#/database/queries/select%20…` with RUNS 2 · AVERAGE 7.2 ms · Slowest run 10 ms. 20 keys from Database.

## Rating effect

In-app › Database — Ease 7 → 8 (keyboard)
