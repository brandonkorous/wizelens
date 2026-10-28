# 113 — Rendering's Phone / Desktop table misses every view from the published page script

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · standing check: numbers at the edges (page views by hand)
**Surface:** Rendering › "Page / Phone / Tablet / Desktop" table; a route's "On each device" cards
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 re-run, 2026-10-28 00:30 (phone 390); P02 Greta Rendering re-check 00:31

## What happened

At 00:25 I sent 7 views by hand from the site with the CDN script tag: 5 from a phone (/, /services, /contact,
/services, /) and 2 from a desktop (/, /resume). Rendering (1 h) route table went from 8 to 15 views, page by page
exactly right. The device table did not move at all: still 8 phone views, no desktop column, at 00:27 too. So the
phone share she would tell a client was "100%" when it was 13 of 15 (87%).

The device comes from `user_agent.original` on the page view. The page script sends it only since 2026-10-27
(persona #013), and the published script (0.3.0-alpha.13, 2026-10-26) does not. Earlier views counted because
those visits loaded this branch's script. Every site on the CDN tag today, and every site that pins an older script,
gets no device split and no browser on its errors.

## What should have happened

The visitor's browser posts the data itself, so its request's User-Agent names the device. The intake fills it in
when the page script did not.

## The fix

- `node/src/client-spans.ts` `withVisitorAgent(span, userAgent)`: a page view or browser error with no
  `user_agent.original` takes the request's User-Agent. Exported from `@wizeworks/lens-node/kit`.
- Both browser intakes use it: the cloud's browser-key intake (`cloud/src/routes/browser.ts`) and an app's own
  `/_wizelens/api/client-spans` (`node/src/api.ts`). A browser name the page sent stays as it is.
- Tests: `browser-keys.test.ts` "names the visitor's browser from the request when an older page script does not";
  `node/src/endpoints.test.ts` "accepts browser spans" checks the name.
- Views stored before the fix keep no device; they cannot be filled after the fact.

## Confirmation

- 00:30, Noor's phone (390), Rendering (1 h): with the CDN script, a phone visitor opened / and /services and a
  desktop visitor opened /about. The device table moved by exactly that: / phone 2 → 3, /services phone 2 → 3, and
  /about got a Desktop cell "240 ms 1 view". The route table went from 15 to 18.
- Rule 7, 00:31: Greta's Rendering (30 d) still loads; her old /sign-up view is the same gap in old data.
