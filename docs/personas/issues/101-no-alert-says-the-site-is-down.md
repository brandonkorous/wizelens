# 101 — No alert can say "my site is down"

**Status:** open
**Severity:** major
**Found by:** P04 · Haddad Studio · act 8
**Surface:** Alerts › New alert (Metric), Uptime
**Filed:** 2026-10-27
**Fixed:** —
**Confirmed by:** —
**Blocked on:** —

## What happened

Noor's job in act 8 is "tell me when the site is down". Uptime had no "alert me" step, and Alerts › New alert lists
Error rate, durations, Requests, error types, Slow queries, Log lines, Security risks, a metric, and an SLO; nothing
about checks. The docs say "an error-rate alert in the check's environment tells you when checks fail", but uptime runs
are not in the error rate (they are kept out of app traffic on purpose), and she would not know the service name
`wizelens-uptime` to scope one. She could not make the alert at all.

## What should have happened

An alert that fires when an uptime check fails and clears when the checks pass, reachable from Uptime.

## Where it lives

`core/src/models/alerts.ts` (`ALERT_METRICS`), `ui/src/pages/alerts/AlertForm.tsx`, `ui/src/pages/uptime/UptimePage.tsx`,
`site/content/docs/uptime.md`.
