# 091 — One page load says "Total 1.56 s" at the top and 6.14 s everywhere else

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 5
**Surface:** Cloud › Traces › one page load (a full page load with no server traced)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 5 at 22:14 on Noor's phone: the slow page load says TOTAL 6.14 s and RENDER 6.13 s (Network and other 3.4 ms, the host), the same 6.14 s as the route's list and its timeline, and its problem list says "Slow page: the main content showed at 6.14 s; 1 picture is bigger than the screen needs" instead of "No problems found". RULE #7: P02 Greta's board trace (391b74ba…) still says TOTAL 658 ms, SERVER 21 ms, RENDER 321 ms, as before.
**Blocked on:** —

## What happened

From the slow page she taps its newest page load (6.14 s in the list). The trace page says **TOTAL 1.56 s** and
**RENDER 1.56 s**, then "No problems found in this request", and its own timeline bar is 6.14 s. Two numbers for one
visit, and the big one at the top is the smaller. She cannot tell Rémy which is true.

## What should have happened

The top says what each number is: the first text showed at 1.56 s, the main content at 6.14 s. "Total" is the time
until the page was ready for the visitor, the same 6.14 s the lists show.

## Where it lives

`core/src/health.ts` `traceTiming()`: for a page load it takes first paint (FCP) as `totalMs`, the way the HUD counts a
server page. For a page view with no server, the lists use the page's render time (LCP), so the header and the lists
disagree.

## The fix

`core/src/health.ts` `traceTiming()`: when no server span is in the trace, a page load lasts until its main content
showed (the page's render time, as every list shows it), and Render is that minus the first byte. A traced server page
keeps the HUD's count (first paint). Also new: `core/src/page-findings.ts` adds a **Slow page** problem to any page
view whose main content showed after 2.5 s (a warning after 4 s), named with its oversized pictures; it stays out of
request insights, since Rendering already lists slow routes.
