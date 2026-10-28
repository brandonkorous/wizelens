# 066 — No HUD on my error page, the one page I need it on

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 8
**Surface:** HUD on a server page (.NET and Node injection)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 8 · eShop error page
**Blocked on:** —

## What happened

`/Basket` answered 500 with eShop's developer exception page. The page has no `<wizelens-hud>`: no card, no
"open trace". Every other page Sid opened had it. He had to go to the dashboard and find the request by hand.

## What should have happened

An error page (404, 500) gets the HUD like any page, red, with its trace one click away.

## How to reproduce

1. eShop with the HUD on. Any page that throws, or a missing page that renders HTML (404).

## Why it matters

The failing page is where a developer reaches for the HUD first.

## Where it lives

`.NET Web/HudMiddleware.cs` `IsFullPage` and Node `hud-inject.ts` `qualifies`: only a `200` answer takes the tag
(docs/HUD-PLAN.md "Injecting it").

## The fix

`.NET HudMiddleware.IsFullPage` and Node `hud-inject.ts` `pageStatus`: a 200, 4xx or 5xx HTML answer takes the tag;
redirects and other answers still do not. docs/HUD-PLAN.md says so. Tests: `HudInjectTests.Puts_the_tag_on_an_error_page`
(404, 500), a 302 page left alone; Node `hud-inject.test.ts` "error pages".

## Confirmed by

2026-10-27 19:31, P03 Sid, `/Basket` (500, eShop's developer exception page): `<wizelens-hud>` is on the page; the
card reads `GET /Basket` **500** in red, 288 ms, "2 SQL · 0 Fetch · 1 Error".
