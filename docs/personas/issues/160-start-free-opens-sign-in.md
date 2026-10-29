# 160 — "Start free" opens a sign-in form, not a sign-up form

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 4 (from Pricing)
**Surface:** Site › Pricing, Cloud ("Start free"); Cloud › Sign in
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 1440 and 360 light, 15:57

## What happened

Ifeoma has no account. On Pricing they pressed "Start free" and got "Sign in to WizeLens" with an email and a
password. The way to make an account was the last small link, "Create an account". Every "Start free" and "Start
free, upgrade in the app" button on the site does the same.

## Where it lives

`js/packages/ui/src/shell/auth/AuthScreen.tsx` keeps sign-in or sign-up as screen state only, so no address opens
sign-up. The site links go to `https://app.wizelens.com` (`site/src/sections/pricing/plans.ts`, `sections/cloud/Cloud.tsx`).

## Fix

A `#/sign-up` page opens on "Create your account" (signed in, it goes to the overview; with sign-up closed, it shows
sign-in and the invite note). The site's "Start free" buttons open it.

## Confirmation

- 15:57, Ifeoma: every Start free on Pricing points at `/_wizelens/#/sign-up`; on the local cloud that address opens "Create your account" with Name, Email and Password, and the account is made from it.
