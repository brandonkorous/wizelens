# 223 — Marisol's email link opened the billing of her other organization

**Status:** fixed
**Severity:** major
**Found by:** P05 · Kaweah Valley Credit Union · Billing row checked again (rule 7)
**Surface:** Cloud › Organization › Billing, People & access (pages opened from an email)
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** as Marisol, with "KVCU — Vendor Sandbox" open, `#/organization/billing?org=fe3e…` opened "Kaweah Valley Credit Union — IT is on the Business plan" (before: Vendor Sandbox's Free plan); `#/people/members?org=a6e6…` opened Vendor Sandbox's members. Test: `billing-jobs.test.ts` checks the usage email links to `#/organization/billing?org=<its org>`.
**Blocked on:** —

## What happened

Marisol is in two organizations: Kaweah Valley Credit Union — IT and KVCU — Vendor Sandbox. A link to the IT
organization's billing opened the Vendor Sandbox's billing, because that was the last one she looked at. The usage
emails ("used 80% of the data", "spend cap reached") link to Billing with no organization at all, and the team emails
name one (`?org=`) that the People pages did not follow.

## What should have happened

An email about one organization opens that organization's page.

## Where it lives

`ui/src/data/urlState.ts`: off the data pages, a link's `project` was followed and its `org` was not.
`cloud/src/billing/notices.ts`: the usage email link had no `org`.

## The fix

`urlState.ts` `linkScope` follows a link's `org` and `project` on every page. `notices.ts` puts `?org=<id>` on each
organization's billing link.
