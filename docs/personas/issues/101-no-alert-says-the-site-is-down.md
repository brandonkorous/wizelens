# 101 — No alert can say "my site is down"

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 8
**Surface:** Alerts › New alert (Metric), Uptime
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P04 act 8 on her phone. Uptime › **Alert me when one fails** opened New alert with Metric "Uptime checks failing", is above 0, 5 minutes, and the hint "Counts the checks on Uptime whose newest run failed. It clears when they pass again." She named it `Site down → Noor's phone (email)` and ticked her own address. Site stopped 23:08:43: both checks Down, incidents opened at 11:08 PM, the alert went Firing at 23:09 ("Uptime checks failing is 2 (above 0)"), and its email is in the cloud log. Site back 23:11:11: checks Up, incidents Resolved after 3 min, the alert Resolved at 23:12 ("no longer above 0") with its email. The first try (a "failed in the window" count) fired at 22:58 on the "Brandon" failure she had already fixed; it now reads each check's newest run.
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

## The fix

A new alert metric, `uptime_failing` ("Uptime checks failing"): the checks whose newest run in the window failed, from
the `up.chk` rollup cut into 60 slices, so a check that is back up stops counting at once; no runs is no data. It takes
no service or endpoint. Uptime has an **Alert me when one fails** button that opens New alert filled in; the rule page
links to Uptime. Docs: `alerts.md`, `uptime.md`. Tests: `alerts.test.ts` "counts the uptime checks whose newest run
failed, and nothing without runs".
