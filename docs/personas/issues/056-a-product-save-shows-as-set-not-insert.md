# 056 — My product save shows as "SET Catalog", not as an INSERT

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 4
**Surface:** In-app dashboard (.NET) › Traces › trace › Timeline, SQL tab, Database
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 4 · trace timeline and Database
**Blocked on:** —

## What happened

Sid saved product 12 in the Blazor admin. It failed (eShop's `Name` column holds 50 characters). In the API's
dashboard he opened the failed `POST /api/catalog-items`. The timeline reads:

    SELECT Catalog   0.46 ms
    SET Catalog      1.1 ms

He clicked `SET Catalog`. The query is an INSERT:

    SET IMPLICIT_TRANSACTIONS OFF;
    SET NOCOUNT ON;
    INSERT INTO [Catalog] ([Id], [CatalogBrandId], ...) VALUES (@p0, ...);

## What should have happened

`INSERT Catalog`. Every EF Core save on SQL Server starts with these `SET` lines, so every INSERT, UPDATE and DELETE
of his store reads "SET". The Database page's operation filter (SELECT, INSERT, UPDATE, DELETE, OTHER) puts them
all under OTHER.

## How to reproduce

1. eShop on .NET 8 with WizeLens, SQL Server LocalDB. Admin → Create New → any product → Create.
2. `https://localhost:5099/_wizelens/` → Traces → `POST /api/catalog-items`. Every time.

## Why it matters

The span name is the first thing Sid reads. "SET" hides that the call wrote a row; the INSERT/UPDATE/DELETE
filters miss every write.

## Where it lives

- .NET: `dotnet/src/WizeLens.AspNetCore/Data/DbActivity.cs` `OperationRegex` takes the first word.
- Node: `js/packages/node/src/db.ts` `parseSql` takes the first word (`mssql`/`tedious` callers can send the same).
- Dashboard: `js/packages/core/src/stats/database.ts` `operationOf` falls back to the first word for spans without
  `db.operation.name` (OTLP from other SDKs).

## The fix

One rule, three places: the verb is the first word after leading `--` comments and `SET ...;` statements. A lone
`SET search_path = x` stays `SET`.

- .NET: `Data/DbActivity.cs` `OperationRegex`. Test: `SqlOperationTests` (net8.0 and net10.0).
- Dashboard: `core/src/stats/database.ts` `sqlVerb`, used by `operationOf` for spans without `db.operation.name`.
  Test: `database.test.ts`.
- Node: `node/src/db.ts` `parseSql` now calls the same `sqlVerb`.

Calls stored before the fix keep their old name ("SET Catalog", under OTHER) until they age out.

## Confirmed by

2026-10-27 18:47, P03 Sid, eShop on .NET 8: Create New → product 12 → Create (fails again on the 50-character
name). The new trace of `POST /api/catalog-items` reads `INSERT Catalog 21 ms`; the Database page's breakdown shows
INSERT 21 ms, where it showed "–" before.
