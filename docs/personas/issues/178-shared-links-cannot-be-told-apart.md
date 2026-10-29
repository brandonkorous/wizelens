# 178 — Shared links cannot be told apart: a trace ID, a blank row, and no word on who a link is for

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 6 (the slowest Ostrava trace, for Jiří Dvořák (Ostrava Bikes))
**Surface:** People & access › Shared links; the trace's Share box; the top bar's page-link box
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at People & access › Shared links, 1440 light, 16:59

## What happened

The list named a trace link only "24ebfbc4". A page link made from the top bar showed as a row with an empty name,
under a description that said the links were "to single traces". Neither box had a place to say who a link was for,
so an agency with links out to many clients could not tell which one to revoke. The page-link box also did not say
where to revoke the link, as the trace box does.

## Where it lives

`js/packages/cloud/src/routes/shares.ts`, a new column (`SHARE_NOTE_MIGRATION` in `db/schema-saved.ts`),
`js/packages/ui/src/pages/people/SharesSection.tsx`, `pages/trace/ShareButton.tsx`, `shell/SharePage.tsx`.

## Fix

A trace link keeps the trace's request as its title ("GET /report"). Both boxes take "Who is it for?" (up to 120
characters), kept with the link and in the audit line. The list shows Link (the request and short ID, or "Requests
page, as it was") and For. The page-link box says how long the link works and where to revoke it. Tests:
`access.test.ts`; `sso-removed.test.ts` now finds its migration by name.

## Confirmation

- 16:59, Ifeoma: the list reads "GET /report 24ebfbc4 · Jiří Dvořák (Ostrava Bikes)", "Requests page, as it was" and
  "Trace 24ebfbc4" (made before the fix). She revoked the last two together; the link opens signed out.
