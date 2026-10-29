# 219 — The cloud docs are one 26,800 px page

**Status:** fixed
**Severity:** minor
**Found by:** P06 at 360, site `/docs/cloud/`
**Surface:** site docs
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid at 360: `/docs/cloud/` is 13,400 px, `/docs/teams/` 8,300 px, `/docs/plans/` 5,700 px; check-seo passes on 57 pages

## What happened

Running the cloud, teams and roles, single sign-on, billing, and a summary of every feature page sat on one page.

## Where it lives

`site/content/docs/cloud.md`.

## Fix

Split into WizeLens Cloud (run it, connect, keys, AI apps, options, and a linked list of what the cloud adds), Teams and access, and Plans and billing. Links to the old anchors point at the new pages.
