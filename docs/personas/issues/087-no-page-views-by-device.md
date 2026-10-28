# 087 — Nothing shows her pages by phone, tablet, and desktop

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 4
**Surface:** Cloud › Rendering
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 4 at 21:44 on Noor's phone (390 px): Rendering › **By device** says "All pages on localhost:4173: Phone 282 ms (12) · Tablet 301 ms (8) · Desktop 434 ms (8)", the same 12 / 8 / 8 visits she made, and lists each page with its phone, tablet and desktop time, the slowest on a phone first (/contact 608 ms). RULE #7: P02 Greta's Rendering (7 days) shows "Desktop 1.52 s (1)" for her one page view with a known browser, and dashes for the rest.
**Blocked on:** —

## What happened

Noor visited her 12 pages from a phone (390 px), a tablet (768 px), and a desktop (1440 px). Rendering lists the pages
and their times for all visits together. No screen splits them by device, so she cannot see how her site does on a
phone, which is the reason she is here (act 5: "which page is slow on a phone?"). Every page view already carries the
browser's user agent; only error groups use it.

## What should have happened

Rendering shows each page's views and load time on phones, tablets, and desktops, and the totals for each.

## Where it lives

`core/src/scale/facts-render.ts` folds page views by route and phase, never by device; `core/src/user-agent.ts` names
the browser and system but not the device class.

## The fix

`core/src/user-agent.ts` `deviceOf()` names the device class (Phone, Tablet, Desktop) from the user agent.
`core/src/scale/facts-render.ts` adds a `pv.dev` fact per page and device (render time, with a histogram), and
`FACTS_VERSION` is 16, so hosts rebuild their facts once. `core/src/models/render-devices.ts` makes the table; the
Rendering model carries it as `devices`. The UI is `ui/src/pages/rendering/DeviceTable.tsx`: one line with the totals,
then a table with a column per device. When all pages are on one site, the rows show only the path.

Note: page views carry the user agent since #013. The published CDN script (`@wizeworks/lens-browser` 0.3.0-alpha.13)
is older and does not send it, so a site on the CDN tag shows dashes here until the next browser release. The
confirmation used this branch's script, served in place of the CDN file (the tag in her page did not change).
