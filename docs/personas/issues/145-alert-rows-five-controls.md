# 145 — Every alert row carried five controls, and on a phone they needed a sideways swipe

**Status:** fixed
**Severity:** minor
**Found by:** P02, P04 (rating gap on Alerts); worked in the 7-score pass
**Surface:** Alerts › Rules (and the rule's own page)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 Noor at 360 dark touch, 09:12; rule 7 P02 Greta at 1440, 09:13

## What happened

Each rule row showed Mute…, Turn off, Test, Edit and Delete side by side. At 1440 the five read as noise beside one
rule; at 360 the Rules table was 878 px wide in 326 px, and the actions sat past a swipe.

## Fix

- `ui/src/pages/alerts/RuleActions.tsx`: the row keeps the urgent action (Acknowledge when firing, Unmute when muted)
  and Edit; mute times, Turn off/on, Send a test and Delete… sit in one "More…" picker, named "More actions for <rule>"
  for screen readers. Turning a rule off or on now says "<rule> is off." / "is on.".
- `ui/src/pages/alerts/AlertsPage.tsx`: on a phone the rule, last value and channels sit under the name; those columns
  hide. The phone-line class is shared with Sending keys (`wl-phone-line`).
- `styles/pages/alerts.css`: the picker is 96 px wide on a phone.

## Confirmation

- 09:12, Noor at 360 dark touch: the Rules table is 326 px in 326 px; the row reads "Site down → Noor's phone (email) /
  Uptime checks failing > 0 over 5 minutes · last 0 · Email · OK · Edit · More…". More… › Send a test →
  "Test sent: email: mail is not set up (see the cloud log)", and Recent notices lists the Test.
- Rule 7, 09:13, Greta at 1440: "API error rate > 2% (5 min) — page Greta · Error rate of kanninja-backend > 2% over 5
  minutes · OK · – · Email · Edit · More…".
