# 106 — A shared link is titled "WizeLens", not the site it is about

**Status:** fixed
**Severity:** minor
**Found by:** P04 · Haddad Studio · act 10 (the other side: Rémy opens the link)
**Surface:** shared link page header; Share this page
**Filed:** 2026-10-27
**Fixed:** 2026-10-28
**Confirmed by:** at 23:59 Noor made a new 7-day link to the slow blog post; Rémy opened it signed out on a 390 px phone and at 360 px in dark: "Brandon K. — personal site (Vite) · as of Oct 27, 2026, 11:59 PM · link works until Nov 3, 2026". Rule 7: Greta's shared Errors link reads "kanninja-production · as of …".

## What happened

At 23:57 Rémy opened Noor's link on his phone. Its header read "WizeLens · as of Oct 27, 2026, 11:56 PM · link works
until Nov 3, 2026". It did not say whose site this is: the project, "Brandon K. — personal site (Vite)", is nowhere
on the page. Every link from every project gets the same title.

## What should have happened

The header names the project the link came from.

## The fix

`ui/src/shell/SharePage.tsx` sent `document.title` with everything after " · " cut off, and the tab title is
"WizeLens · <service>", so every title was "WizeLens". It now sends the project's name (`currentProject`).
