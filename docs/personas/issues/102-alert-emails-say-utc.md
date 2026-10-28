# 102 — Alert emails give the time in UTC

**Status:** fixed
**Severity:** minor
**Found by:** P04 · Haddad Studio · act 8 (standing check: dates against the phone's clock)
**Surface:** alert emails ("When"), Account › Emails (Time zone)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** at 23:07 Noor opened the app on her phone once; Account › Emails › Time zone then read America/Los_Angeles with no step from her. The next outage's emails say "When: Oct 27, 2026, 11:09 PM PDT" (fired) and "When: Oct 27, 2026, 11:12 PM PDT" (resolved), the same times as Uptime's incidents on her phone.

## What happened

The site went down at 10:59 PM on her phone. The alert email said "When: 2026-10-28 05:59 UTC": another day, and a
zone she has to convert. Her account had a time zone (for digests), but it was UTC until she found Account › Emails,
and alert emails did not use it anyway.

## What should have happened

The email gives the time on her own clock.

## The fix

`cloud/src/mail/clock.ts` `clockIn()` writes "Oct 27, 2026, 11:09 PM PDT"; the alert email uses each reader's saved zone
(`zonesOf`). The zone is now marked set (`mail_prefs.zone_set`, migration `ZONE_SET_MIGRATION`) once the person picks
one; until then the app sends the browser's zone once after sign-in (`useZoneOnce`). Tests: `templates.test.ts`,
`digest.test.ts`.
