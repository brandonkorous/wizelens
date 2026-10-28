# 082 — A new cloud account on a phone shows only zeros, and no way to start

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 2
**Surface:** Cloud › Overview, first visit after sign-up
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P04 · act 2 on a 390 px phone; RULE #7 on P02 Greta's Overview
**Blocked on:** —

## What happened

Noor signed up on her phone. The cloud opened Overview: "Total Requests 0, No data for previous day", then
"Avg Duration –", "SQL Queries 0", and further down "Use your app and requests show up here." Nothing on the screen
says she must make a key and add it to her site first. Connect, where that happens, is not in the phone's bottom bar
(Overview, Problems, Requests, Errors, More). On a desktop P02 found Connect in the sidebar; on a phone it is two taps
away, under More, with no sign that she needs it.

## What should have happened

An empty Overview says nothing has arrived yet and gives one tap to the setup steps.

## Where it lives

`ui/src/pages/overview/OverviewPage.tsx`: the model knows the range is empty (`model.empty`), and the page shows the
cards as if there were data. "Use your app and requests show up here" (`ActivityPanel.tsx`) is only true once a key
is set up.

## The fix

On the cloud, an Overview whose range holds nothing opens with a banner: "Nothing has arrived in this range. New
here? Make a key and add it to your site or service: Setup steps." The link opens Connect › Setup steps. The in-app
dashboard has nothing to connect, so it shows no banner.

## Confirmed by

2026-10-27, by 21:06, as Noor on a 390 px phone: the Overview shows the banner above the cards; "Setup steps" opens
`#/connect/setup`. RULE #7: Greta's Overview (7 days, 611 requests; 1 hour, 9 requests) shows no banner.
