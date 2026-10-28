# 123 — Search opens on "Requests (0)" while the hits are on another tab

**Status:** fixed
**Severity:** design
**Found by:** P04 · Haddad Studio · scoring sweep (Search, ease 7)
**Surface:** Search (`#/search`)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 Noor at 360, 01:15; P02 Greta at 1440, 01:15

## What happened

A static site sends no server requests. Noor searched `contact` and Search opened on "Requests (0)" with an empty
table, while "Traces (154)" and "Spans (157)" held her hits one tap away.

## What should have happened

With no tab picked, Search opens on the first tab that has hits; a tab she taps stays.

## The fix

`ui/src/pages/search/SearchPage.tsx`: without `kind` in the address, the open tab is the first of Requests, Traces,
Spans, Logs with hits once the counts arrive; a tapped tab goes in the address (Requests too), so it stays.

## Confirmation

- 01:15, Noor at 360, `contact`: opens on "Traces (155)" with 50 rows; a tap on Requests shows "Requests (0)" and stays.
- Rule 7, 01:15, Greta at 1440, `api`: opens on "Requests (1,000+)" as before.
