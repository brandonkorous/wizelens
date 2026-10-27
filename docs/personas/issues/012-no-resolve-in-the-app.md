# 012 — Dani looked for Resolve on the error and found nothing, with no word why

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 7
**Surface:** Dashboard (in-app) › Errors › details panel and error page; Insights and Security details too
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 7 — Errors › ApiClientError details now says where Resolve and Ignore are, with a How link
**Blocked on:** —

## What happened

Dani opened "ApiClientError: Validation failed" on `http://localhost:3000/_wizelens/#/errors`
to mark it resolved. The panel offered "Tag this", "View full error" and "View affected
requests"; the full error page offered "Tag this", "Copy stack trace" and "Open latest
trace". No Resolve, no Ignore, and no sentence saying where they are.

## What should have happened

The docs are right: "In your app, the Errors page shows no actions: the hub and the cloud
keep these states." (`/docs/errors/`). The home page says "Resolve or ignore a group"
without that limit. The screen should say it where the buttons would be, with the way to
get them.

## Why it matters

Absence behaved like fine: a missing feature looked exactly like a page with nothing to
do. Dani thinks WizeLens cannot resolve errors at all.

## Where it lives

`js/packages/ui/src/ui/IssueControls.tsx` `IssueActions` — `if (!on) return null` on hosts
without the `issues` capability (in-app Node, .NET).

## The fix

`IssueActions` on a host without the `issues` capability now says, where the buttons would be: "Resolve and Ignore
are on the hub and in the cloud, which keep these states. How" (insights: "Mark fixed and Dismiss …"), and **How**
opens `https://wizelens.com/docs/errors/#resolve-ignore-and-assign`. One component, so Errors, Insights and Security
details all get it. The cloud and the hub (with `issues`) are unchanged.

## Confirmed by

> Re-ran P01 act 7: `#/errors`, row "ApiClientError: Validation failed" → Error Details shows "Resolve and Ignore are on
> the hub and in the cloud, which keep these states. How" under Tag this; readable in light and dark. The real
> resolve is done in P02 on the cloud.

## Rating effect

In-app › Errors — Ease 6 → 7
