# 094 — An error says "Chrome on Android", not whether it was a phone

**Status:** fixed
**Severity:** minor
**Found by:** P04 · Haddad Studio · act 6
**Surface:** Cloud › Errors › one error › Browsers (and Account › Sessions)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 6 at 22:26: the error's Browsers list says "Chrome on Android (phone) · 2". Desktop browsers keep their short name ("Chrome on Windows").
**Blocked on:** —

## What happened

The contact page error's Browsers list says "Chrome on Android · 1". Act 6 asks "on which phone". Android runs on
tablets too, and Rendering already splits Phone, Tablet, and Desktop, so the two screens do not use the same words.

## What should have happened

"Chrome on Android (phone)", the same device word Rendering uses.

## Where it lives

`core/src/user-agent.ts` `shortAgent()` names the browser and the system only; `deviceOf()` is not used there.

## The fix

`core/src/user-agent.ts` `shortAgent()` adds "(phone)" or "(tablet)" from `deviceOf()`, so Errors, Sessions, and
Rendering use the same device words. The label is part of the errors-by-browser fact key, so `FACTS_VERSION` is 18.
