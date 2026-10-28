# 164 — Sign-in errors in engineer words: "Invalid token", "Invalid code"

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 4 (an old confirm link, a used reset link, a wrong code, a wrong password)
**Surface:** Cloud › every account screen that shows an error
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 light, 16:07

## What happened

The account screens print the auth library's message as it comes. A used reset link said "Invalid token"; the
confirm-email screen said "This link does not work. Invalid token. Send a new link."; a wrong code said "Invalid
code"; a wrong password said "Invalid email or password". Ifeoma does not know what a token is, and "invalid" does
not say what to do.

## Where it lives

`js/packages/ui/src/data/account.ts` › `auth()`: every Better Auth call's error, one place.

## Fix

A map from Better Auth's error code to plain words ("This link is old or was already used.", "That code is not right.
Use the newest code from your app.", "The email or the password is not right.", "This email already has an
account…"). Codes not in the map keep the server's message. Code checks (`SESSION_NOT_FRESH`, `TOKEN`) still read the
code, not the words.

## Confirmation

- 16:07, Ifeoma: a wrong password reads "The email or the password is not right."; a wrong code "That code is not right.
  Use the newest code from your app."; the used reset link "This link is old or was already used."; the old confirm
  link "This link is old or was already used. Send a new link."
