# 222 — After someone else used this browser, every page said "The link was for a project you cannot open"

**Status:** fixed
**Severity:** copy
**Found by:** P04 · Haddad Studio · check again of the Overview row (rule 7)
**Surface:** Cloud › every page › the note under the top bar
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** in one browser, Sid signed out and Noor signed in by the sign-in form: before the fix every page said "The link was for a project you cannot open, so you see Brandon K. — personal site (Vite)"; after it, Marisol out and Noor in again shows no note. A real link to Sid's project (`#/requests?project=f7b8…`) opened as Noor still shows the note.
**Blocked on:** —

## What happened

Noor opened the cloud from its plain address, with no link. Every page said "The link was for a project you cannot
open". There was no link: the browser still kept the project Sid had open before he signed out.

## What should have happened

The note shows only when the address Noor opened names a project she cannot open. A project kept from someone else's
visit is changed in silence.

## Where it lives

`ui/src/data/account.ts` `pickProject`: it set the note for any kept project it could not find, from a link or from
browser memory.

## The fix

`account.ts` reads the project the opening address names (`linkedProject`), and the note is set only when the missing
project is that one.
