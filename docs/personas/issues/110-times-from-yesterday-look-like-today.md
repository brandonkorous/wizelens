# 110 — After midnight, yesterday's times look like today's

**Status:** fixed
**Severity:** minor
**Found by:** P04 · Haddad Studio · standing check: dates (America/Los_Angeles)
**Surface:** every list that shows a time of day: Requests, Errors, Logs, and the others using `fmtTime`
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** at 00:13 (machine in America/Los_Angeles) Noor's Requests rows read "Oct 27, 10:18:27 PM", her resolved errors "Oct 27, 10:29:54 PM", and the /resume route page listed "12:11:39 AM" (a visit at 00:11) above "Oct 27, 9:55:50 PM". Rule 7: Greta's Requests read "Oct 27, 8:53:01 PM" and her Errors list still shows her 1 open group.

## What happened

At 00:11 on Oct 28 Noor opened Requests (last 24 hours) on her phone. The rows said "10:18:27 PM" and nothing else.
That was Oct 27. At 11 AM the same list would show yesterday's 10:18 PM and today's 9 AM side by side with no day,
and "10:18 PM" reads as later than "9 AM".

## What should have happened

A time from another day carries its date: "Oct 27, 10:18:27 PM". Today's times stay short.

## The fix

`ui/src/format.ts` `fmtTime()`: when the time is on another day than now (in the zone the person picked), it starts
with the date ("Oct 27, "). Every list that uses it gets this.
