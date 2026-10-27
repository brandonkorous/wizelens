# 003 — Every call in the HUD details read "GET http://localhost:3001/a…", so Dani could not tell which one loaded the cards

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 4
**Surface:** HUD › details panel (Calls)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 4 — opened the HUD details on the Q4 Workshop board; calls read GET /api/v1/boards/:boardId/members, …/clans, …/realtime-ticket
**Blocked on:** —

## What happened

On the board page Dani opened the HUD details to find the call that loads the
cards. The **Calls · 6** list read:

> GET http://localhost:3001/a… 326 ms
> POST http://localhost:3001/… 320 ms
> POST http://localhost:3001/… 468 ms
> GET http://localhost:3001/a… 53 ms
> GET http://localhost:3001/a… 51 ms
> GET http://localhost:3001/a… 51 ms

Four rows say the same thing. The part that tells them apart (`/members`,
`/clans`, `/realtime-ticket`) is cut off, and on a phone there is no hover.

## What should have happened

Each row names the call the way the API names it: `GET /api/v1/boards/:id/members`.
The server already sends that name back with each call.

## How to reproduce

1. Sign in to kanNINJA, open the board `Q4 Workshop Fit-Out: Müller Kitchens, …`.
2. Open the HUD details (the ^ button). Every time, for any app whose API is on
   another origin.

## Why it matters

The details panel exists to answer "which call was slow". When every row reads the
same, it cannot answer it without clicking each one.

## Where it lives

`js/packages/browser/src/hud/waterfall.ts` — `callRow` names a row
`${r.method} ${r.path}`; for another origin `r.path` is the full URL
(`requests.ts` `pathOf`). `r.server.name` (the first server span's name, the route
template) is never used there.

## The fix

New `callName` in `waterfall.ts`: a call shows the server's own route name when the server sent one;
else its path, with another origin's host put last (`GET /api/x · localhost:3001`) so the path is what gets
cut, not the host. Tests: `page-summary.test.ts` "names a call by its server route…"; `controller.test.ts`
test calls now carry their own route names. Siblings: the card, the details title and the tab title show
the page (same origin), so they keep `method + path`.

## Confirmed by

> Re-ran P01 act 4: reloaded the board, opened the HUD details. **Calls · 5** read
> `GET /api/v1/boards/:boardId · 7 SQL`, `POST /api/v1/boards/:boardId/realtime-ticket · 5 SQL`,
> `GET /api/v1/boards/:boardId/members · 6 SQL`, `GET /api/v1/boards/:boardId/clans · 5 SQL`,
> `GET /api/v1/clans · 4 SQL`. Each links to its own trace.

## Rating effect

HUD › details — Ease 5 → 8
