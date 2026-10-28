# 099 — A text check on a JavaScript page fails, and does not say why

**Status:** fixed
**Severity:** minor
**Found by:** P04 · Haddad Studio · act 8
**Surface:** Uptime › a check › the failure line, and its Incidents reason
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** at 22:52 on her phone, Run now on `Home page — every 1 min` says: The response does not contain "Brandon". This page builds its text with JavaScript, and a check reads only the HTML the server sends. Look for text in that HTML, such as the page title (failed twice in a row). The Avg Response card says "1 run" for one run.

## What happened

Noor's home check expects the text `Brandon`, the name on her page. It went Down at once, with the site up: "The
response does not contain "Brandon"". Her page is a Vite/React app, so the HTML the server sends is an empty
`<div id="root">` and a script; the name is written by JavaScript. Nothing on the screen said so, and she would not
know to look at the raw HTML. Also, the Avg Response card said "1 runs, 1 failed".

## What should have happened

When the answer is a page that a script fills in, the failure says so and says what to look for.

## Where it lives

`hub/src/uptime/run.ts` `verdict()` (the cloud runs the same code); `ui/src/pages/uptime/CheckDetail.tsx`.

## The fix

`verdict()` adds the JavaScript sentence when the body has an empty `root`, `app`, `__next`, or `svelte` element and a
script. "1 run" for one. Test: `run.test.ts` "fails on a wrong status, missing text, or a timeout".
