# 040 — The audit log says I cancelled an invite, but not whose

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 9
**Surface:** Cloud › People & access › Audit log
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 9 — invited Siobhán, cancelled with "Cancel invite", opened Audit log: "Greta Lindqvist-Ochoa · Cancelled an invite · p03.siobhan@kanninja.test · as member" (Cloud › People & access › Audit log); entries from before the fix stay bare. cloud.test.ts 7 pass
**Blocked on:** —

## What Greta saw

She wants "a record of who did what". The log read "Greta Lindqvist-Ochoa · Invited someone ·
p03.siobhan@kanninja.test · as member", then "Greta Lindqvist-Ochoa · Cancelled an invite" with nothing after
it. With two invites out, she could not tell from the log which one she cancelled.

## Where it lives

`cloud/src/auth/hooks.ts` `auditOrgChange` keeps the request body as the detail. A cancel sends only
`invitationId`, which is kept out as a secret, so the entry had no detail at all.

## Fix

- `cancelledInvite(ctx)`: on a cancel, the entry keeps the email and role from the cancelled invite that Better
  Auth sends back. The log page already shows both.
- `cloud.test.ts`: a cancelled invite's entry names its email and role.
