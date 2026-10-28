# 112 — Team, project health, and security emails still give the time in UTC

**Status:** fixed
**Severity:** minor
**Found by:** P04 · Haddad Studio · standing check: wrong move (revoked key still in the site), reading the team email
**Surface:** emails: team changes, project quiet / back, every security notice
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 Noor and P02 Greta security emails, 2026-10-28 00:21–00:22; team email by test, re-checked live in P05

## What happened

At 00:18 the team email about her revoked key said "(2026-10-28 07:17 UTC)". On her phone it was Oct 28, 12:17 AM.
#102 gave alert emails her own time zone; the team, project health, and security emails were left behind with
their own UTC clocks (`emails-team.ts`, `emails-health.ts`, `emails-security.ts`).

## What should have happened

Every email gives the time on the reader's clock, as alert emails do now.

## The fix

- `mail/emails-team.ts`, `mail/emails-health.ts` and `mail/emails-security.ts` drop their own UTC clocks and use
  `clockIn` (`mail/clock.ts`), the one #102 made for alerts. An unknown zone still shows UTC.
- `notify/team.ts` and `notify/health.ts` look up each manager's saved zone (`zonesOf`) and pass it in.
  `auth/security-notices.ts` `sendSecurity` reads the person's zone and passes it with the links.
- Test: `mail/templates.test.ts` "gives team, health, and security times in the reader's zone too".

## Confirmation

- 00:21: Noor signed in from Safari on a Mac. The "New sign-in" email said "When: Oct 28, 2026, 12:21 AM PDT".
- Rule 7, 00:22: Greta signed in the same way. Her email said "When: Oct 28, 2026, 12:22 AM PDT".
- The team email goes out only for other people's changes or system notices. Noor works alone, so P05 (a team
  admin) re-checks the team email time on screen.
