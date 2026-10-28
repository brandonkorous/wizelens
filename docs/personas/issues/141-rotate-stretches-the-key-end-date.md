# 141 — Rotating the contractor's key moved its end date past the contract

**Status:** fixed
**Severity:** major
**Found by:** P05 Marisol, during the #140 check
**Surface:** Connect › Sending keys › Rotate
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol 08:56

## What happened

Marisol rotated "Loan Desk API — staging key (expires 2026-12-31)". The new secret's Expires read "Jan 1, 2027": the
rotate gave the key a fresh copy of its whole life from the moment of the rotate. A key made to stop on the contract's
last day (#128) would run past it, more each time it is rotated, and nothing on screen said so.

## Fix

`cloud/src/repo/keys.ts` `rotateKey`: the new secret keeps the old key's end date; a rotate never stretches access.
The Rotate question now says "with the same end date". Test in `team.test.ts`; `docs/CONTRACT.md`.

## Confirmation

- 08:56, Marisol made "Loan Desk API — vendor audit key (to 2026-12-31)" ending Dec 31, 2026, and rotated it: the new
  secret reads "Dec 31, 2026", the old one "Old secret, stops Oct 29, 8:56:02 AM".
- She then revoked the stretched Jan 1, 2027 secret and both test keys.
