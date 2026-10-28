# 058 — My Razor pages say "Render –" (not measured), but the HUD measured them

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · acts 3 and 6
**Surface:** In-app dashboard (.NET) › trace header, request panel, Overview "Request Timing Breakdown"
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 6 · request panel, trace header, Overview
**Blocked on:** —

## What happened

The HUD on `/Basket` says: Total 85 ms · Server 4.8 ms · Database 1.8 ms · Render 74 ms. Sid opened the same kind of
page load in the dashboard. Its trace header says:

    TOTAL 3.9 ms   SERVER 3.9 ms   DATABASE 1.1 ms   RENDER –

The timeline under it shows `pageview /Basket 256 ms` from the browser. The request panel says "Rendering –", and
the Overview says "Render –" with the note "Render and network need the browser add-on. A dash means it was not
measured." The browser add-on is on: the HUD is on the page, and the page view is in the trace.

## What should have happened

The same numbers as the HUD. The page view carries `wizelens.page.ttfb_ms` and `wizelens.page.fcp_ms`; the HUD uses
them (first paint from navigation start; render = first paint − first byte).

## How to reproduce

1. eShop on .NET 8 with WizeLens and its HUD. Open any Razor page, for example `/Basket`.
2. `https://localhost:5001/_wizelens/` → Requests → `GET /Basket` → its trace. Every time, for every page load.

## Why it matters

Every page of a server-rendered app (Razor, MVC, server pages in Node) reads "not measured" for render, and its
Total is the server time only. It says something false: the time was measured. Sid's question in act 6 ("where did
the 85 ms go?") has two answers.

## Where it lives

- `js/packages/core/src/health.ts` `traceTiming`: render comes only from a browser `fetch` span
  (`wizelens.browser.render_ms`); a full page load has no fetch span.
- `dotnet/src/WizeLens.AspNetCore/Analysis/RequestItem.cs` `RequestItems.Of`: the same rule in .NET.

Note: the run's browser is driven (`navigator.webdriver`), so its page views are also marked bot; that does not
change the trace header (it does not drop bot spans). The run browser now starts without the automation flag, so
Sid's browser counts as a person, as his Chrome does.

## The fix

A full page load (a page view with `navigation = load`, no fetch span) is timed as the HUD times it: Total = first
paint from navigation start (`wizelens.page.fcp_ms`), Render = first paint − first byte (`wizelens.page.ttfb_ms`),
Network = Total − Render − Server.

- Dashboard: `core/src/health.ts` `traceTiming` (`pageLoadOf`), and `core/src/stats/requests.ts` `networkOf` for the
  request rows (Requests list, request panel, Overview breakdown). Test: `late-browser.test.ts`.
- .NET: `Analysis/RequestItem.cs` `RequestItems.Of` (`PageLoadOf`), the same rule for the .NET rows. Test:
  `PageLoadTimingTests` (net8.0 and net10.0).
- Checked: a fetch-based trace (SPA, the Blazor admin's calls) keeps its old rule; the Node SDK sends the same page
  view, so Node server pages get the same fix from core.

## Confirmed by

2026-10-27 18:57, P03 Sid: `/Basket` → Requests → `GET /Basket`: the panel reads Total 416 ms · App 293 ms ·
Database 15 ms · Rendering 110 ms · Network 13 ms; the trace header the same, and 293 + 110 + 13 = 416. The Overview's
breakdown reads Render 242 ms, Network 23 ms (it read "–"). Re-checked at 18:59:59 with #059: HUD and trace both
388 · 261 · 14 · 117 ms.
