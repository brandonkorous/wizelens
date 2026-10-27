# P02 — Greta Lindqvist-Ochoa · kanNINJA operations

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-26

**Status:** not started
**Run:** —
**Role:** system and database admin · WizeLens Cloud (organization owner)

## Account

| Field | Value |
| --- | --- |
| Cloud email | `p02.greta@kanninja.test` |
| Password | `Lantern-Orchard-42!` |
| Organization | — |
| Project | — |
| Cloud URL | http://localhost:5970/ |

Fill these in as soon as signup gives them to you. A run nobody can revisit is a
run nobody can confirm.

## The person

Greta Lindqvist-Ochoa, 52, she/her. Twenty years as a DBA (Oracle, then
Postgres) and Linux admin; at kanNINJA she owns the database, the cluster, the
backups, the on-call rota and who-can-see-what. She runs kanNINJA's production
on one small Postgres server with a 10-connection pool per API pod.

**Technical level.** High on databases and servers; reads `EXPLAIN ANALYZE` for
fun. Lower on front-end words: "hydration" and "RSC" mean nothing to her, and a
screen that needs them to make sense is a screen she skips.

**What she is nervous about.** One query that turns slow at 02:00 drains the pool
and takes the whole product down, and she hears about it from a customer; and a
tool that copies customer emails out of SQL into somebody else's cloud.

**What made her look today.** Dani (P01) said "WizeLens shows every query", and
Greta wants it for production — but only behind her own sign-in, with her own
keys, her own alert, and nobody seeing more than they need.

## The business

**kanNINJA operations** — the production side of the same kanban SaaS as P01.

- 2 services send: `kanninja-backend` (Fastify API) and `kanninja-frontend`
  (Next.js); one key per service, so a leaked key can be killed alone
- The Postgres server is small: any query over 250 ms is a problem, and more than
  8 calls of one shape in one request is an N+1 to her
- Customer data is personal: SQL parameters hold emails and names; she must see
  that they are hidden before anyone else gets access
- **Inconvenient for the software:** she rotates every key every 90 days, and she
  will revoke the wrong one at least once; her developer gets access to one
  project only, as a viewer

## Why she is here today

1. "Show me the slowest queries in production, with how often they run."
2. "Wake me up — by email — when the API's error rate passes 2% or a query is slow."
3. "Dani gets to look, not to change anything, and I want a record of who did what."

## Setup answers

| Question | Answer |
| --- | --- |
| Organization name | `Lindqvist-Ochoa Ops — kanNINJA` |
| Project | `kanninja-production` |
| Sending keys | `kanninja-backend (API pods)`, `kanninja-frontend (web pods)` |
| Environment | `production` |
| Slow query threshold | `250` ms |
| N+1 threshold | `8` similar calls |
| Data retention | `14` days |
| Alert email | `p02.greta@kanninja.test` |

## The data

**This is the test data. Type it as written** (RULE #2).

### Alert rules

| Name | When | Send to |
| --- | --- | --- |
| `API error rate > 2% (5 min) — page Greta` | error rate of `kanninja-backend` over 2% for 5 minutes | email to members |
| `Slow SQL on the board load (≥ 250 ms)` | a database call of 250 ms or more | email to members |

### Uptime check and SLO

| Kind | Name | Target |
| --- | --- | --- |
| Uptime | `kanNINJA API health — every 60 s` | `http://localhost:3001/health` |
| SLO | `Board API: 99.5% of requests succeed (30 days)` | `kanninja-backend`, success |

### People

| Name | Email | Access |
| --- | --- | --- |
| Dani Okonkwo-Brennan | `p01.dani@kanninja.test` | viewer on `kanninja-production` only |
| Siobhán O'Callaghan | `p03.siobhan@kanninja.test` | invited, then the invite cancelled (she left) |

### The neighbour (set up before the run, through the UI)

Organization `Harrow & Vance Studio`, owner `p00.harrow@harrowvance.test`, project
`hv-bookings` with one sending key, and traces from its own service named
`hv-bookings-api`. Greta must never see any of it.

---

## The setup they leave with

**This list is the definition of done** (RULE #8). Every item, built and working,
before the run is `done`.

| Item | What it must have |
| --- | --- |
| Her own cloud org | signed in with 2FA on, org and project named as above |
| One key per service | two sending keys named as above, each in kanNINJA's env, both services sending |
| Production-like traffic | P01's board traffic arriving in the cloud, with SQL, from both services in one trace |
| The slow queries, ranked | the Database page sorted by total time, each shape with count, avg, p95, and a link that opens it again |
| Her thresholds | slow query 250 ms and N+1 at 8 set, and the pages show what they flag with those numbers |
| An alert that fired | at least one rule fired and its email is in the cloud's log, with a link that opens the rule |
| An uptime check and an SLO | both running, both with numbers that match a hand count |
| Least access | Dani a viewer on one project; Siobhán's invite cancelled; the audit log shows every change Greta made |
| Nothing personal in SQL | no email address, password or session token visible in any SQL, log or header in the cloud |
| A key rotation she survived | the wrong key revoked, noticed, and fixed without losing more than a minute of data |

**Working end to end:** Greta goes to bed; a slow board query at 02:00 emails her
a link, and the link opens the query that did it.

**The look.** An operator's console: the cloud, many services, thresholds, alerts
and people — not one app's workbench like P01's.

**Also required:** both themes, 360px (she reads alerts on her phone), keyboard
only for one full job.

---

## The run

### Act 1 — from the site to her own cloud account

Greta opens wizelens.com, reads Cloud and Pricing, and signs up for the cloud. She
verifies her email and turns on 2FA before anything else.

**Done when:** she is signed in, her email is verified (the link came from the
cloud's mail log), and 2FA is on.

### Act 2 — the organization, the project, the keys

She names the org and project, and makes one sending key per service.

**Done when:** two keys exist with her names, and the screen told her exactly
which env variables kanNINJA needs.

### Act 3 — point kanNINJA at the cloud

She puts each key into its service's env (`WIZELENS_HUB`, `WIZELENS_HUB_TOKEN`),
restarts both, and loads one board.

**Done when:** the cloud's Overview shows both services and the board load is one
trace with its SQL. Record minutes from sign-up to this first trace.

### Act 4 — the slowest queries in production

On Database she sorts by total time, opens the worst shape, and reads its plan
of attack: count, avg, p95, the requests that ran it.

**Done when:** she can name the query that costs the most and link to it; a hand
count from three traces agrees with the count on screen.

### Act 5 — her thresholds

She sets slow query to 250 ms and N+1 to 8, and checks that Insights and Problems
now flag with those numbers.

**Done when:** a 300 ms query is flagged and a 200 ms one is not; an N+1 of 9 is
flagged and one of 7 is not (or the screens say plainly why they are not).

### Act 6 — is personal data leaking into SQL?

She opens the sign-up and sign-in traces from P01 and searches the cloud for
`p01.dani@kanninja.test` and for `Lantern-Orchard`.

**Done when:** no password or session token appears anywhere; email addresses in
SQL parameters are hidden, or she knows exactly where to turn that on.

### Act 7 — wake me up

She makes the two alert rules, then makes them fire (P01's 5,000-character list
name errors; a slow board load).

**Done when:** each rule shows it fired, the email for each is in the cloud's mail
log, and the link in the email opens that rule.

### Act 8 — uptime and an SLO

She adds the uptime check and the SLO. Then she stops the kanNINJA API for two
minutes and starts it again.

**Done when:** the uptime check records the outage with the right start and end
times, and the SLO's budget moves by what she computes by hand.

### Act 9 — least access

She invites Dani as a viewer on `kanninja-production`, invites Siobhán, then
cancels Siobhán's invite.

**Done when:** Dani (signed in as P01) sees the project and cannot change a
setting or make a key; Siobhán's invite link no longer works; the audit log lists
each step with Greta's name and the time.

### Act 10 — the key she revoked by mistake

During the 90-day rotation she revokes `kanninja-backend (API pods)` instead of
the old frontend key.

**Done when:** the cloud warned her what she was about to stop, she saw the API's
data stop, made a new key, put it in the env, and the gap in the data is under a
minute and visible as a gap, not as "0 errors".

### Act 11 — retention

She sets data retention to 14 days and reads what that means for the data she has.

**Done when:** the screen says in plain words what is kept and what is deleted,
and the audit log records the change.

---

## What only this persona proves

The cloud: sign-up with 2FA, an org with per-service keys, alerts by email, uptime
and SLOs, people and least access, retention, and a neighbour org that must stay
invisible.

---

## Standing checks

**Wrong moves.** Revoke the wrong key (act 10). Save the same alert rule twice by
double-clicking "Save". Cancel an invite after the person already accepted it —
what happens to their access?

**Reload and deep link.** F5 on a query shape page; open the alert email's link
while signed out (it must sign her in and land on the rule); open the shared link
of a query in a fresh window.

**Dates.** The uptime outage in act 8 recorded at the right local time
(America/Los_Angeles, UTC-7 until 2026-11-01 02:00, then UTC-8); the 30-day SLO
window's first day; retention of 14 days counted from today, 2026-10-26.

**Numbers at the edges.** The SLO budget: 99.5% of N requests with E failed is a
budget of 0.005 × N, of which E is spent — compute it, then look. The error rate
for the alert: failed ÷ total over the 5-minute window.

**The other side.** Dani, signed in as P01 with the viewer invite, opens the alert
link Greta forwards and sees the same rule, read-only.

**Without a mouse.** Act 7, keyboard only: from Overview to a saved alert rule.

**Somebody else's data.** Search for `Harrow & Vance`, `hv-bookings` and
`p00.harrow`; paste a trace id from the neighbour's `hv-bookings-api` into the
address bar; open the project switcher and check that only her project is listed.

---

## Verification

Filled in at the end, honestly, **including what was skipped** (RULE #4).

| | Result |
| --- | --- |
| Acts completed | |
| Issues filed | |
| Issues fixed and confirmed | |
| Issues blocked, and on what | |
| Screens scored | |
| **Not checked** | |

### The numbers

| Record | Result |
| --- | --- |
| Minutes from cloud sign-up to the first kanNINJA trace | |
| Speed at real volume (100+ requests, 2 services) | |
| Alerts fired / emails logged | |
| SLO budget (hand vs. screen) | |

---

## Run log

Written act by act **as you go**, not reconstructed at the end. Each entry: what
you did, what you saw, what you decided. Quote the exact words on screen — the
sentence is often the defect.
