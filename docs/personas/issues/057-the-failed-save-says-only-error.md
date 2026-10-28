# 057 — The failed save's first error says only "error"

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 4
**Surface:** In-app dashboard (.NET) › Traces › trace (error banner, Errors tab)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 4 · trace error banner
**Blocked on:** —

## What happened

The failed `POST /api/catalog-items` trace shows two red banners:

    ERROR  PublicApi: error                POST /api/catalog-items
    ERROR  PublicApi: String or binary data would be truncated in table ...

The Errors tab says the same: "in POST /api/catalog-items · error". The first one tells Sid nothing.

## What should have happened

It should say why the request is an error: it answered 500. The Node SDK writes `HTTP 500` for the same case
(`js/packages/node/src/request-capture.ts:134`); the .NET SDK writes nothing, so the dashboard falls back to "error".

## How to reproduce

1. Any ASP.NET Core endpoint that answers 500 after eShop's own exception handler catches the error.
2. Open its trace. Every time.

## Why it matters

Cosmetic but on the first line Sid reads in a failed trace: a banner with no information.

## Where it lives

`dotnet/src/WizeLens.AspNetCore/Capture/RequestEnricher.cs:40` sets the error status with no description.

## The fix

`Capture/RequestEnricher.cs`: a 5xx answer with no exception sets the status text `HTTP 500` (the code it
answered), as the Node SDK does. Test: `ServerErrorStatusTests` (net8.0 and net10.0). Node checked: it already
writes `HTTP {status}`.

## Confirmed by

2026-10-27 18:47, P03 Sid: the new failed trace's first banner reads "PublicApi: HTTP 500 · POST
/api/catalog-items", above the SQL Server message.
