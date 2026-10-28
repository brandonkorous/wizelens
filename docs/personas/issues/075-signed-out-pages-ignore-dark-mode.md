# 075 — The contractor's shared link and the sign-up page stay light in dark mode

**Status:** fixed
**Severity:** design
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · scoring act 11 (shared link, Create account) in dark
**Surface:** Cloud › signed-out pages: Sign in, Create account, shared trace link
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · scoring · shared trace and Create account in dark
**Blocked on:** —

## What happened

With the dark theme chosen (and the system in dark), the cloud's Create account page and the shared trace link
opened white. Every signed-in page was dark.

## What should have happened

A page follows the theme the person chose, signed in or not.

## Where it lives

`App.tsx`: the theme went onto `<html>` inside `Shell`, which renders only after the sign-in gate. Sign-in pages and
shared links render from the gate and never set it.

## The fix

`App` applies the theme above the gate, once, for every page. The default stays "light" for a first visit (a
choice of the product: "System" is one of the three themes, not the default).

## Confirmed by

2026-10-27, by 20:23, signed out, dark theme: Create account is dark (white text on the dark card, blue button); the
shared link of act 7's save (`93fafe0b…`) is dark with the same trace and SQL. Light still light. RULE #7: P02 Greta's
signed-in Overview in the cloud: dark when dark, light when light.
