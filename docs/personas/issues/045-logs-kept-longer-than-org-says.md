# 045 — The page says no project keeps data longer than 14 days, then offers 400 days of logs

**Status:** fixed
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 11
**Surface:** Cloud › Organization › Data retention
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 11 — Data retention reads "A project never keeps traces longer than the organization; its logs can have their own days." beside the "Logs kept" list that offers up to 400 days (Cloud › Organization › Data retention)
**Blocked on:** —

## What Greta saw

With the organization at 14 days, the page said "A project never keeps data longer than the organization."
The same page's "Logs kept" list for kanninja-production offered 30, 60, 90, 180, 365 and 400 days. Both cannot
be true. She could not tell if 90 days of logs would be kept or cut to 14.

## Where it lives

The cloud keeps logs for a project's own `log_retention_days` (1 to 400) with no cap at the organization's days
(`cloud/src/repo/log-retention.ts`, `routes/projects.ts`). The sentence in
`ui/src/pages/organization/RetentionSection.tsx` described traces only.

## Fix

The sentence says what the cloud does: "A project never keeps traces longer than the organization; its logs can
have their own days." Whether logs should instead be capped at the organization's (and the plan's) days is a
product call, noted for Brandon.
