# 165 — "Password changed. Password changed. Sign in." and no button to sign in

**Status:** fixed
**Severity:** nit
**Found by:** P06 Ifeoma, act 4 (reset the password from the emailed link)
**Surface:** Cloud › reset-password, after the change
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 360 dark, 16:08

## What happened

After a new password, the card read "Password changed" over "Password changed. Sign in.", with a small "Back to
sign in" link. It said the same thing twice, and did not say what the reset did: the cloud signs out every device
(`revokeSessionsOnPasswordReset`). Ifeoma, who reset it because of a worry, wants to know that.

## Where it lives

`js/packages/ui/src/shell/auth/PasswordScreens.tsx` › `ResetPassword`.

## Fix

"Every device that was signed in is now signed out. Sign in with the new password." and a main "Sign in" button.

## Confirmation

- 16:08, Ifeoma: a second reset ends on "Password changed — Every device that was signed in is now signed out. Sign in
  with the new password." with one blue Sign in button; it opens the sign-in form.
