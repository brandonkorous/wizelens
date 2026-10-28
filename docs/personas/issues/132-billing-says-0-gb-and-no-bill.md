# 132 — Billing said "0 GB" used and "0 GB" projected while two services sent data, and never said what she will pay

**Status:** fixed
**Severity:** major (a number on screen was false)
**Found by:** P05 · Kaweah Valley Credit Union · act 8, the bill
**Surface:** Organization › Billing › Usage
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol at 1440, 03:03; P02 Greta 03:05

## What happened

Both credit union services had sent data for 40 minutes (the day bars showed it). Billing said "0 GB of 150 GB included"
and "Projected by month end 0 GB". Marisol's hand projection was about 13 MB; the screen's was less than what she had
already used. And the page listed "Projected extra data $0" and "Renews Nov 28" but no dollar amount for the plan, so
"what will we pay next month" needed the Plans cards and arithmetic.

## Why

- Amounts were rounded to 0.01 GB (used) and 0.1 GB (projected), so megabytes showed as 0.
- The projection spread the month's data over every day since the 1st, though the organization started sending on the 28th.

## The fix

- `cloud/src/billing/summary.ts`: `monthProgress(now, firstDay)` projects from the first day with data this month (still
  counting at least one day); `projectedFrom` is returned; GB kept to 4 decimals. Test in `billing.test.ts`.
- `ui/src/data/billing.ts` `fmtGb`: under 1 GB shows MB ("3.3 MB", "13 MB", "under 0.1 MB"), so data that was sent never
  reads as 0.
- `ui/src/pages/organization/BillingUsage.tsx`: "Projected by month end (at the rate since Oct 28)", and the coming charges
  with their dates: "Projected extra data, billed Nov 1, 2026 $0" and "Business plan, billed Nov 28, 2026 $99".

## Confirmation

- 03:03, Marisol: "3.3 MB of 150 GB included", "Projected by month end (at the rate since Oct 28) 13 MB". By hand: 3.3 MB on
  Oct 28 (one day so far) × 4 days to Oct 31 = 13.2 MB. Extra data $0 on Nov 1 (13 MB is far under 150 GB); plan $99 on
  Nov 28. Matches.
- Rule 7, 03:05, P02 Greta (Unlimited plan): "48 MB this month", "Projected by month end (at the rate since Oct 27) 167 MB";
  by hand 48 MB ÷ 1.42 days × 5 days ≈ 169 MB. Matches.
