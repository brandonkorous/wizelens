# 108 — Another customer's trace id says "no longer stored", as if it were hers

**Status:** fixed
**Severity:** copy
**Found by:** P04 · Haddad Studio · standing check: somebody else's data
**Surface:** trace page and Requests panel for an id not in this project
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** at 00:06 Noor pasted Greta's trace id again on her 390 px phone: `#/traces/<id>` said "This trace is not in this project, or it is no longer stored.", and Requests with `?trace=<id>` said "This request is not in this project, or it is no longer stored." Nothing of Greta's showed in either.

## What happened

At 00:05 Noor pasted one of Greta's trace ids into her address bar (`#/traces/<id>`). Nothing of Greta's showed,
which is right. But the page said "This trace is no longer stored. It may have been dropped." That says the trace was
once in her project. It never was, and she would look for what dropped it.

## What should have happened

The page says what is true in both cases and nothing about other projects: the trace is not in this project, or it
is no longer stored.

## The fix

The two not-found sentences: `ui/src/pages/trace/useTrace.ts` and `ui/src/pages/requests/RequestsPage.tsx`.
