# 086 — A static site is shown an "SSR Time" it does not have

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 4
**Surface:** Cloud › Rendering (cards, phase breakdown, Pages & Routes table, one route's page)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P04 · act 4 on a 390 px phone; RULE #7 on P02 Greta's Rendering
**Blocked on:** —

## What happened

Noor's site is a Vite build of plain files: there is no server rendering. Rendering says "SSR Time 2.2 ms", the phase
breakdown says "Server-side rendering (SSR) 2.2 ms", and every row of Pages & Routes has an "SSR Time". The sentence is
false for her site, and it suggests a server she does not have.

## What should have happened

The number is real, but it is the server's time to send the first byte (`responseStart − requestStart`): the file
host on a static site, the server render on an SSR app. The label says that, true for every site.

## Where it lives

The labels: `core/src/models/rendering.ts` and `core/src/stats/rendering.ts` ("Server-side rendering (SSR)"),
`ui/src/pages/rendering/RenderingPage.tsx`, `RenderTables.tsx` and `RoutePage.tsx` ("SSR Time", "Avg SSR Time").
The measure is `browser/src/pageview.ts` `loadTimings`.

## The fix

Renamed, same number: the card is "Server Response", the phase is "Server response (server render, or the file
host)", the Pages & Routes column is "Server Response" (its hint: "Full page loads only: the server's time to send
the first byte"), and a route's card is "Avg Server Response".

## Confirmed by

2026-10-27, by 21:34, as Noor on a 390 px phone, from the Overview banner's Rendering link: "Server Response 2.2 ms",
the phase "Server response (server render, or the file host)", and the table column "Server Response". No "SSR" left
on the page except the page's own subtitle, which lists what the page can cover. RULE #7: Greta's Rendering (kanNINJA,
server-rendered) shows the same labels, phase 176 ms.
