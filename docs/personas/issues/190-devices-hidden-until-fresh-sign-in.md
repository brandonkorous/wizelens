# 190 — Devices shows no devices unless you signed in during the last 15 minutes

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, scoring pass (Account › Devices, 40 minutes after her last sign-in)
**Surface:** Account › Devices
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Account › Devices, 1440 light, 17:43

## What happened

The page says "Where you are signed in now. Sign out of any you do not know." Under it was only "For safety, sign in
again first. Sign out and sign in again". The list itself was hidden. Someone who suspects a stolen session has to
sign out before they may even look, which is the wrong way round.

## Where it lives

Better Auth's `list-sessions` wants a sign-in from the last 15 minutes, because each row carries the session token.
`js/packages/ui/src/pages/account/SessionsPanel.tsx` showed only that refusal.

## Fix

A cloud endpoint, `GET /api/auth/wizelens/devices` (`js/packages/cloud/src/auth/devices.ts`), lists the person's
live sessions without tokens and needs only a sign-in. The page uses Better Auth's list when the sign-in is recent
(so each device can be signed out) and this list otherwise, with "To sign a device out, sign in again first." Test:
`account.test.ts` (same sessions, no token field).

## Confirmation

- 17:43, Ifeoma (signed in 34 minutes earlier): "Signed in · Chrome on Windows · 127.0.0.1 · Oct 28, 2026, 5:09 PM ·
  34m ago · This device".
