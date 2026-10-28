# 115 — When her session ends with a page open, the next screen says "send a read key" and has no way to sign in

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · standing check: reload, deep link, restore (a session that ends with the tab open)
**Surface:** every dashboard screen on the cloud, after the session ends (expired, signed out elsewhere, password changed)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 re-run, 2026-10-28 00:43 (phone 360); P02 Greta signed-in screens, 00:44

## What happened

At 00:42 Errors was open on her phone. Her session ended (as when she changes her password or signs out every other
device from her Mac). She tapped Requests in the bottom bar. Requests showed its filters and a red box: "Could not
load this page: Sign in, or send a read key." There was no sign-in button or link (0 on the page). "Read key" is not
her word. Only a full reload brought the sign-in form. A fresh browser, or a reload, shows the sign-in form at once.

## What should have happened

The first refused call takes her to the sign-in form, on the same page, so she comes back to Requests after signing in.

## The fix

- `ui/src/data/api.ts`: every dashboard answer passes `noteStatus`; a 401 calls the handler set with `onRefused`.
  `data/sources.ts` (its own fetch) passes it too.
- `ui/src/data/account.ts` sets that handler: when the dashboard thinks someone is signed in, a 401 reloads who is
  signed in (`loadAccount`). The session is gone, so the sign-in form shows, and the address stays the same.
- Nothing changes for an app's own dashboard or a shared page: no one is signed in there, so a 401 does nothing new.

## Confirmation

- 00:43, Noor's phone (360): Errors open, session ended, tap on Requests: the sign-in form showed at once (Email,
  Password, Sign in). She signed in and landed on Requests ("Requests" heading, `#/requests`).
- Rule 7, 00:44: Greta, signed in at 1440, opened Errors, Requests and Connect › Sending keys: her data each time,
  no sign-in form.
