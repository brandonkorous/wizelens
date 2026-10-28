# 098 — The Errors badge counts resolved errors, and every service

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 7 (re-proved on P02 · Greta)
**Surface:** the Errors count in the sidebar and the phone's bottom bar
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** at 22:45, Noor's bottom bar (390, last hour) has no Errors count after she resolved both "trim" groups; before it said 2. Greta (desktop, last 7 days, scope "Web App") sees Errors 2, the same as her Errors page's "Total Exceptions 2"; before it said 8, her errors from every service.

## What happened

Noor fixed the contact form and resolved both error groups. Errors said "Recent Exceptions (0)", but the red badge on
Errors in her bottom bar still said 2, and it stayed. A red count she cannot clear tells her the site is still broken.
Greta, scoped to "Web App", saw 8 on the badge and 2 on the page: the badge ignored the scope chip and the period.

## What should have happened

The badge counts the exceptions in error groups that are still open, in the same scope and period as the Errors page.
A resolved group counts again when it comes back.

## Where it lives

`core/src/models/badges.ts` counted every exception (`err`), with no issue states and no service; `ui/src/data/models.ts`
`useServerErrorCount` asked with no scope or period.

## The fix

The badges model sums the error groups (`err.g`) for the chosen service and leaves out the groups the "Unresolved"
filter leaves out (`issueKeys`), so a regressed group counts again. Hosts load issue states for it (`ISSUE_PAGES`).
The UI passes the service scope and the period, as the Errors page does. Tests: `models.test.ts` "leaves resolved and
ignored errors out of the sidebar count, until they come back", and the service case.
