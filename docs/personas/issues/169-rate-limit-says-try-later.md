# 169 — "Too many requests. Please try again later." with no idea how much later

**Status:** fixed
**Severity:** nit
**Found by:** P06 Ifeoma, act 5 (changing the email back a third time in five minutes)
**Surface:** Cloud › every account form (sign-in, two-step, reset, change email, delete)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 light, 16:24

## What happened

The cloud limits how often each sign-in form can be sent (a safety rule). When Ifeoma hit it, the form said "Too
many requests. Please try again later." She could not tell if "later" meant a minute or tomorrow. The limits last
5 minutes at most (`rateLimitOptions` in the cloud).

## Where it lives

`js/packages/ui/src/data/account.ts` › `auth()`: the 429 answer passed through as the library's words.

## Fix

A refused call with status 429 reads "Too many tries in a short time. Wait up to 5 minutes, then try again."

## Confirmation

- 16:24, Ifeoma: a fourth email change in five minutes reads "Too many tries in a short time. Wait up to 5 minutes,
  then try again."
