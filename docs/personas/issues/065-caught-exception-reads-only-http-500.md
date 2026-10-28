# 065 — The basket's crash reads "HTTP 500"; the exception eShop's error page shows is not in WizeLens

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 8
**Surface:** In-app dashboard (.NET) › Trace detail, Errors
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 8 · Trace detail
**Blocked on:** —

## What happened

Sid deleted product 523 (bear canister) in the admin while it was in his basket. `/Basket` now answers 500, and
eShop's developer exception page shows `InvalidOperationException: Sequence contains no matching element` at
`BasketViewModelService.cs:60`. WizeLens's trace `99653e21…` says only **"Web: HTTP 500"**: no exception type, no
message, no stack, and the Errors page groups it as "HTTP 500".

The SQL tab does show why: the Catalog query ran with `@__ids_0 = [523]` and returned nothing. But Sid only learns the
exception from eShop's page, which a customer never sees and production never shows.

## What should have happened

The trace's error is the exception: type, message, and stack, as when it reaches WizeLens.

## How to reproduce

1. eShop Web: `UseWizeLens()` at line 119, `UseDeveloperExceptionPage()` at line 175 (inside it). Same with
   `UseExceptionHandler("/Error")` in production.
2. A handler throws. Open its trace.

## Why it matters

Every ASP.NET app puts an exception page or handler inside the pipeline. With it, WizeLens loses every unhandled
exception's type and stack, which is the first thing Sid needs on a Black Friday 500.

## Where it lives

`Web/WizeLensMiddleware.cs` records an exception only in its own `catch`. The developer exception page (or
`UseExceptionHandler`) catches it first and writes the 500, so WizeLens sees a normal return.

## The fix

- `Capture/HandlerSpan.cs`: an exception that passes the handler is kept in `HttpContext.Items`, then rethrown.
- `Capture/CaughtException.cs`: when the request ends with a 5xx (not marked expected) and no exception reached
  WizeLens, the kept exception, else `IExceptionHandlerFeature.Error` (UseExceptionHandler), goes on the request span:
  exception event and error status with its message. Skipped when the span already has one (the auto install's
  hosting activity does), so it is never counted twice.
- Test: `ServerErrorStatusTests.An_exception_the_developer_page_caught_is_still_on_the_request`; the auto install's
  `Records_exceptions_the_developer_exception_page_caught` still finds exactly one.

## Confirmed by

2026-10-27 19:31, P03 Sid, `/Basket` with product 523 deleted: trace `4f60de04…` error row reads
"Web: Sequence contains no matching element"; Errors tab: `System.InvalidOperationException` in
`GET /Basket/{handler?}` with the stack down to `BasketViewModelService.<GetBasketItems>b__1` (line 60).
