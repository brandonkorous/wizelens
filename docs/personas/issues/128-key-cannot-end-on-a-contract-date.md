# 128 — Marisol could not make the contractor's key stop on the contract's last day

**Status:** fixed
**Severity:** minor
**Found by:** P05 · Kaweah Valley Credit Union · act 5, the loan desk key
**Surface:** Connect › Make a sending key › Expires (also AI read keys)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol, Connect › Sending keys at 1440, 02:34–02:35

## What happened

José-Luis's contract ends 2026-12-31, so the loan desk key must stop that day: it is even in the key's name. Expires
offered Never, 30, 90, 180 days or 1 year. On 2026-10-28 none of those is Dec 31 (64 days). She had to pick 90 days
(a month too long, at a credit union) or Never and a calendar reminder.

## The fix

- `cloud/src/routes/keys.ts`: `expiryOf` takes `expiresMs` (an exact time after now, within 3650 days) as well as
  `expiresInDays`. Test in `team.test.ts`. CONTRACT.md says so.
- `ui/src/pages/connect/KeyForm.tsx`: Expires has "On a date", which shows "Last day it works" (a date box, no day before
  today) with "It stops at the end of this day, your time." The key stops at 23:59:59 of that day on her clock.

## Confirmation

- 02:34, Marisol: Make a sending key → Loan Desk API → Expires "On a date" → 12/31/2026 → Create key. Sending keys lists it
  with Expires "Dec 31, 2026".
- 02:35, the loan desk service moved to the new key (Last used "14s ago"); she revoked the old "Never" key. The dialog said
  "It was used 1m ago, so something still uses it" and named Rotate as the no-gap way.
