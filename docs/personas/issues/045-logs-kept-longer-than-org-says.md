# 045 — The page says no project keeps data longer than 14 days, then offers 400 days of logs

**Status:** fixed
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 11
**Surface:** Cloud › Organization › Data retention
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 11 — Data retention reads "A project never keeps traces longer than the organization; its logs can have their own days." beside the "Logs kept" list that offers up to 400 days (Cloud › Organization › Data retention)
**Confirmed by (plan cap, 2026-10-27):** cloud rebuilt and restarted; Greta opened Organization › Data retention: "A project never keeps traces longer than the organization. Its logs can have their own days, up to what the plan allows." (light, no sideways scroll). This local cloud runs with billing off, so the list still offers up to 400 days; the cap itself is proved by `billing.test.ts` (Free: 30 days of logs answers 402 with plan team; Business: 90 days saves; back to Free: the project keeps 14) — not checked on screen
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
have their own days." Whether logs should instead be capped was a product call for Brandon.

## Decision (2026-10-27)

Brandon asked for a recommendation; the pick: logs may outlast the organization's trace days, but never the plan's.
Before this, a Free organization could keep a project's logs for 400 days.

- `cloud/src/routes/projects.ts` `setLogDays`: `requireRetention` answers 402 with the plan that keeps that long.
- `cloud/src/repo/billing.ts` `setPlan`: a move to a smaller plan lowers each project's log days to the new maximum.
- `ui/.../RetentionSection.tsx`: the Logs kept list offers only the plan's days; the sentence says so.
- `site/content/docs/logs.md` and `docs/CONTRACT.md` name the days per plan and the 402.
