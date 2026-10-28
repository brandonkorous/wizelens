# 095 — "No source map found" does not say what to do

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 6
**Surface:** Cloud › Errors › one error › Stack Trace (any browser error without a source map)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 6 at 22:26 on the phone: under "No source map found" the box says "This line is in your built, minified code. A source map turns it back into your own file and line. Add the WizeLens plugin to your build (for Vite: wizelensSourceMaps() in vite.config.ts), and each build sends its maps. Source maps, step by step". She followed it (#096 on the way), and at 22:31 the stack showed `src/pages/Contact.tsx:33:59` with the line that threw.
**Blocked on:** —

## What happened

The stack is `at http://localhost:4173/assets/index-CBBz6Uwe.js:226:34855`, a line of the minified build. The screen
says "No source map found. Showing the raw stack." and stops. Noor does not know what a source map is, where it comes
from, or that WizeLens can show her own line in `src/pages/Contact.tsx`. Act 6 is done only when she sees that line,
or the screen tells her what to upload.

## What should have happened

Under the raw stack: what a source map does in one sentence, the one thing to add to her build, and a link to the
steps.

## Where it lives

`ui/src/pages/errors/ResolvedStack.tsx` `statusOf()`: one status line, no next step.

## The fix

`ui/src/pages/errors/ResolvedStack.tsx` shows `MapHint` when a browser stack has no map: one sentence on what a
source map does, the plugin line for Vite, and a link to the docs' production steps.
