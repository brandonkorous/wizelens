# 090 — The slow page's screen does not say why it is slow, or how slow on a phone

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 5
**Surface:** Cloud › Rendering › one route
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 5 at 22:12 on Noor's phone (390 px), light and dark, and at 360: By device › the blog post (Phone 6.14 s) opens its route page, and **On each device** comes first: Phone · 1 view · **Very slow** ready in 6.14 s; Host answered 3.4 ms, Text showed 1.56 s, Main content showed 6.14 s; "The text shows at 1.56 s, but the main content shows only at 6.14 s. Its pictures hold it up: the slowest took 4.54 s to download. 1 picture is bigger than the screen needs." Tablet (640 ms) and Desktop (1.20 s) say Fast and "Nothing here needs a fix." The page is 390 and 360 px wide.
**Blocked on:** —

## What happened

By device names her slowest page on a phone: `/blog/future-of-devsecops-from-pipelines-to-platforms`, 6.14 s. She
taps it. The route page shows "Avg Render Time 1.71 s" and "Avg LCP 1.71 s", the phone, tablet, and desktop visits
averaged together, so the phone number she came for is gone. Nothing on the page says why it is slow. She sees
"Render", "LCP", "Hydration", and "Server Response"; none of them is a sentence she can say to Rémy. Act 5 asks for
the page, the number, and the reason in one sentence. She has the first two only from the screen before.

## What should have happened

The route page shows the page on each device: views, when the first text showed, when the main content showed, and
one plain sentence on where the time went (the file host, the page's code and styles before anything shows, or the
main content and its images after the text).

## Where it lives

`core/src/models/route-page.ts` reads route averages (`pv.m`) for all devices together; there is no fact per route,
device, and phase. `ui/src/pages/rendering/RoutePage.tsx` has cards and charts, and no words for the cause.

## The fix

Each page view with a known device now adds `pv.dm` facts per route, device, and measure (first byte, first text,
ready, slowest image, large images) in `core/src/scale/facts-render.ts`; `FACTS_VERSION` is 17.
`core/src/models/route-devices.ts` averages them per device and names the biggest stretch (`slowCauseOf`: host, code,
content, or images). The route model carries `devices`. `ui/src/pages/rendering/RouteDevices.tsx` shows a card per
device with Google's fast/slow line (2.5 s / 4 s) and one sentence on where the time went.
