# 038 — The API was down for two minutes and my SLO did not move

**Status:** open
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 8
**Surface:** Cloud › SLOs › one SLO
**Filed:** 2026-10-27
**Fixed:** —
**Confirmed by:** —
**Blocked on:** decision

## What Greta saw

`Board API: 99.5% of requests succeed (30 days)` on `kanninja-backend` read 98.6%, 509 requests, 2.8× spent.
She stopped the kanNINJA API from 10:09:42 to 10:11:53 UTC; Dani opened the board twice and got the sign-in
page. Uptime caught it ("ECONNREFUSED … failed twice in a row", 3:10 AM, 2 min). The SLO then read 98.6%,
511 requests, 2.7× spent: the outage spent no budget, and the page said nothing about why.

By hand the SLO is right about what it counts (511 requests, 7 failed: 98.63%, 7 ÷ 2.555 = 2.7×). It counts the
requests the API answered, and an API that is down answers none. The failures were recorded on the other
side: kanNINJA's web server's calls to the API failed with ECONNREFUSED.

## Where it lives

`core` SLO status reads the service's own request facts. Calls from other services to it, and uptime runs
against it, are not part of it.

## Done now

The SLO page says so: "Counts the requests kanninja-backend answered. While it is down it answers none, so an
outage spends no budget here: an uptime check catches it." (`ui/src/pages/slos/SloPage.tsx`). Seen on the SLO page in act 8, with "uptime check" linking to Uptime.

## Decision for Brandon

How an outage should count against a request SLO:

- **A.** Count callers' failed calls to the service (a fetch to it that got no answer) as its failed requests.
  Closest to what users felt; a facts change, and calls that the service also recorded must not count twice.
- **B.** Let an SLO name an uptime check, and count its down minutes against the budget (a request and time
  blend, which changes the math).
- **C.** Keep the math; draw the uptime incidents of the service's checks on the SLO's charts, and say "No
  requests seen 3:10–3:12 AM while Uptime said down". **Recommended**: honest, no change in what the number means.
- **D.** Keep the sentence only.
