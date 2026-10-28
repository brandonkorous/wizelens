# 109 — Errors says "Nothing failed in this time range" next to "3 exceptions"

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · standing check: deep link to one error
**Surface:** Cloud › Errors › Recent Exceptions (default status Unresolved)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** at 00:10 on her 390 px phone, Errors (7 days) said "No unresolved exceptions — 3 exceptions in this range are resolved or ignored. Show all statuses"; the tap listed her 2 resolved groups (TypeError on /contact). Same text at 360 px. Rule 7: at 00:11 Greta's Errors still lists her 1 open group.

## What happened

At 00:09 Noor opened Errors on her phone (7 days) to copy one error's link. Recent Exceptions said "(0) — No
exceptions. Nothing failed in this time range." On the same screen, Total Exceptions said 3 and Errors by Service
said her site had 3. The three are the contact-form errors she resolved in act 6: the list shows Unresolved by
default, so they are hidden. The empty text says they never happened, and gives no way to see them.

## What should have happened

The list says there are no unresolved exceptions, how many are resolved or ignored, and offers to show them.

## The fix

`ui/src/pages/errors/ErrorTables.tsx` `NoGroups`: when the list is empty on the default Unresolved status and the
range has exceptions (`cards.exceptions`), it says how many are resolved or ignored and offers "Show all statuses".
