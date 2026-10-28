# 055 — Every image and font is a request, so my home page is not on page 1

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 3
**Surface:** In-app (.NET) › Requests, Overview › Recent Requests, Services counts
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 3 · Requests
**Blocked on:** —

## What happened

Sid loaded the store home page once and opened Requests. The list read "Requests (202)"
and page 1 was `/favicon.ico`, `/fonts/Montserrat-Bold.woff`,
`/fonts/Montserrat-Regular.woff`, `/images/arrow-down.png`, `/images/main_banner.png`,
`/images/products/10.png` … `/images/products/2.png`, `/js/site.js?v=…` — all 0 SQL,
under 3 ms. `/`, the page he came to see, was not on page 1 of 14. The Overview's
Recent Requests card showed only files too, and the Services card counted them as
"Web" requests (Avg Duration 13 ms, pulled down by the files).

## What should have happened

WizeLens shows the requests his code answers. A file served as it is from `wwwroot`
is not one, unless it fails. Glimpse, the tool he used before, left them out.

## How to reproduce

1. eShopOnWeb on .NET 8, `app.UseWizeLens()` right after `builder.Build()`, as the docs
   say ("early in the pipeline"), so before `UseStaticFiles()`.
2. Load `https://localhost:5001/` once (about 17 requests), then open Requests.
3. Every time.

## Why it matters

The first screen a .NET developer opens is mostly noise, and the counts and averages
on the Overview and Services are wrong for his app. Any ASP.NET Core app with
`UseStaticFiles` (Razor Pages, MVC) has this.

## Where it lives

`dotnet/src/WizeLens.AspNetCore/Web/WizeLensMiddleware.cs`: only CORS preflights and
health probes are skipped (`SkipAsync`); every other request is kept.

## The fix

Both stacks, the same rule: a request that no route or endpoint answered, whose path names a file, that ended 200,
206 or 304, and is not `text/html`, is not stored. A missing file (404) and an HTML page still are.

- .NET: `Web/StaticFileRequests.cs`; `WizeLensMiddleware` marks the request activity ignored after the pipeline.
  `WizeLensOptions.TraceStaticFiles` (or `WIZELENS_STATIC_FILES=true`) keeps them. Tests: `StaticFileTests` (net8.0
  and net10.0).
- Node: `served-file.ts`; `request-capture.ts` marks the span and `StoreSpanProcessor` skips it, so the hub never
  gets it either. `traceStaticFiles` option. Tests: `served-file.test.ts` (`express.static`).
- Docs: ASP.NET Core, Node, Configuration.

## Confirmed by

2026-10-27 11:04, P03 Sid, eShop on .NET 8: home page then page 2, then Requests. The list grew from 202 to 204:
`/?pageId=1` (16 ms, 4 SQL) and `/` (288 ms, 4 SQL) at the top, and no file after 11:04. The rows above 10:59
are files kept before the fix; they age out with the 24 h window.
