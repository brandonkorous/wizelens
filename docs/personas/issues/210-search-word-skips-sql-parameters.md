# 210 — A word in Search does not find the SQL parameter it is in

**Status:** fixed
**Severity:** minor
**Found by:** P01 and P04, cloud `#/search`
**Surface:** Search
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** core search test only (`card_8841` finds the span that ran with it); not re-checked on screen, because the local spans were saved before the change and keep their old search text

## What happened

Typing an order id or an email in Search found nothing, though `@wizelens.db.parameters:*x*` found the span.

## Where it lives

`core/src/search/docs.ts` built a span's free text from its name, URL, SQL and errors, not its parameters.

## Fix

The span's free text includes `wizelens.db.parameters`. Spans saved before the update keep their old text.
