# 093 — After an error, the site shows two requests it never made, and "Error Rate 0%"

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 6
**Surface:** Cloud › Requests, Errors, Overview (a site with the script tag and no server)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 6 at 22:25 with this branch's script: Rémy's form threw again, and Requests still lists only the two rows from 22:18 (made before the fix); nothing new after 22:25, and the error itself arrived with its frame. Also after the source map upload at 22:30: no new rows.
**Blocked on:** —

## What happened

Rémy's form threw an error at 22:18. Right after it, Noor's Requests page lists two requests from her site:
`GET /assets/index-CBBz6Uwe.js` and `GET /assets/index-CBBz6Uwe.js.map`. Her site makes no requests. Because they
exist, Errors says **Error Rate 0%** (one error, two "requests"), and the Overview stops saying "N page views arrived,
and no server requests". Every browser error on a static site adds two more.

## What should have happened

The WizeLens script's own work does not show as her site's traffic. Requests stays empty, the error rate is "–", and
Overview keeps its page-views message.

## Where it lives

`browser/src/error-frames.ts`: to group an error by its source line, the script downloads the page's script and its
map with the page's `fetch`, which `browser/src/fetch-patch.ts` has already wrapped to trace every request.

## The fix

`browser/src/fetch-patch.ts` exports `OWN_CALL`, a mark on a fetch's options; the wrapped fetch passes a marked call
straight through, with no span and no HUD row. `browser/src/error-frames.ts` reads the page's scripts and maps with a
marked fetch. Test: `lens.test.ts` "does not count its own source map reads as the page's requests".
