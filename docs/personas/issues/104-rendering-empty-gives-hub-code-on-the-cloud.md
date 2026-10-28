# 104 — An empty Rendering page on the cloud gives code that cannot send to the cloud

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 10 (looking for her slow page to share)
**Surface:** Cloud › Rendering (empty range)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** at 23:45 Noor opened Rendering on her phone for 10–11 AM today (no visits): it said "Page views come from the browser. A static site sends them with a browser key's script tag; an app with a WizeLens server SDK sends them with its key. Try a longer time range, or see how: Setup steps." with no code. "Setup steps" opened Connect › Setup steps. Same at 360 px in dark. The in-app dashboard keeps its per-framework code (`HubSetup`, unchanged); P01's kanNINJA runs the npm build, so not re-checked there.

## What happened

At 23:37 Noor opened Rendering on her phone, on the last hour, with no visits in it. The page said "Pick your
frontend" and gave React code with `endpoint="/_wizelens"`; the Plain JS tab gives a tag with
`data-endpoint="/_wizelens"`. On the cloud there is no `/_wizelens` on her site: that code sends nothing. Her real tag
needs a browser key from Connect. The page did not say so, and did not point at Setup steps.

## What should have happened

On the cloud, the empty page says where page views come from here (a browser key's script tag, or a server SDK's
key) and links to Setup steps, as Overview, Requests, SQL and Services already do.

## The fix

`ui/src/pages/rendering/RenderSetup.tsx`: on the cloud (`useHost().has("accounts")`) the empty page shows `CloudSetup`, which
names both ways page views arrive and links to Setup steps. Elsewhere it shows the per-framework code as before.
