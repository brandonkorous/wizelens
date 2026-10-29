# 163 — "A new link is on its way" on a cloud that cannot send email

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 4 (an old confirm-email link, then "Send a new link")
**Surface:** Cloud › Confirm email › This link does not work
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 light, 15:55

## What happened

On a self-run cloud with no mail service, "Send a new link" answered "Check your email … a new link is on its way".
No email was sent: the link went to the cloud's log. Ifeoma would wait for an email that never comes. The
forgot-password screen on the same cloud already says the truth ("This cloud cannot send email…").

## Where it lives

`js/packages/ui/src/shell/auth/LinkScreens.tsx` (`SendNewLink`) did not know whether the cloud sends mail;
`PasswordScreens.tsx` had its own copy of the right card.

## Fix

One `NoMailCard` in `AuthForm.tsx`, used by both screens. `VerifyEmail` gets `mail` from the account state.

## Confirmation

- 15:55, Ifeoma: an old confirm link, then "Send a new link", answers "Ask for the link — This cloud cannot send email…"; the new link from the log confirms the email and opens Overview.
