# P02 — Greta Lindqvist-Ochoa · kanNINJA operations

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-26

**Status:** done
**Run:** 2026-10-27
**Role:** system and database admin · WizeLens Cloud (organization owner)

## Account

| Field | Value |
| --- | --- |
| Cloud email | `p02.greta@kanninja.test` |
| Password | `Lantern-Orchard-42!` |
| Organization | `Lindqvist-Ochoa Ops — kanNINJA` |
| Project | `kanninja-production` |
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

**Outcome:** done, with one difference by design: this cloud has no mail service, so it does not confirm addresses (its start banner says so) and no verify link was sent. Signed up at 00:36 (America/Los_Angeles) as p02.greta@kanninja.test; two-step sign-in On, 10 backup codes; sign-in now asks "Enter the 6-digit code from your app" and the code lets her in. The mail log has "Two-step sign-in is on for WizeLens".

### Act 2 — the organization, the project, the keys

She names the org and project, and makes one sending key per service.

**Done when:** two keys exist with her names, and the screen told her exactly
which env variables kanNINJA needs.

**Outcome:** done after #025 and #026. Org `Lindqvist-Ochoa Ops — kanNINJA`, project `kanninja-production` (renamed from My app), two ingest keys `kanninja-backend (API pods)` and `kanninja-frontend (web pods)`, both in kanninja-production. The key dialog says "Copy it now: it is not shown again. Set it as WIZELENS_HUB_TOKEN on the app"; Connect's step 2 lists WIZELENS_HUB, WIZELENS_HUB_TOKEN, WIZELENS_RELEASE and now the environment setting.

### Act 3 — point kanNINJA at the cloud

She puts each key into its service's env (`WIZELENS_HUB`, `WIZELENS_HUB_TOKEN`),
restarts both, and loads one board.

**Done when:** the cloud's Overview shows both services and the board load is one
trace with its SQL. Record minutes from sign-up to this first trace.

**Outcome:** done. Overview lists kanninja-backend, kanninja-frontend and postgresql. The board load is one trace, `#/traces/391b74ba94001478b1bd52e3a277f525`: services browser + kanninja-backend, fetch 338 ms → GET /api/v1/boards/:boardId 21 ms → 7 SQL (Database 12 ms). Sign-up 00:36:46 → first board load 00:56:25 (America/Los_Angeles): 20 minutes, including fixes #025 and #026. Environment reads `development`: kanNINJA runs its dev servers here (NODE_ENV=development); not changed.

### Act 4 — the slowest queries in production

On Database she sorts by total time, opens the worst shape, and reads its plan
of attack: count, avg, p95, the requests that ran it.

**Done when:** she can name the query that costs the most and link to it; a hand
count from three traces agrees with the count on screen.

**Outcome:** done after #027. Costliest shape: `select … from "auth_users" where "auth_users"."id" = $?` — 44 runs, 121 ms total, avg 2.8 ms, p95 4.3 ms, max 41 ms, 0 slow, 0 errors. Link: `#/database/queries/select%20%22id%22…%20%3D%20%24%3F` (Database › Most total time › first row). Hand count from three of its traces (`/api/v1/clans` bfdc5069…, `/api/v1/boards/:boardId/clans` deb81183…, `…/realtime-ticket` 94707237…): 1 run each on the SQL tab; the Query page's Endpoints table gives 6 runs each for the two clans endpoints over 6 board loads = 1 per load. Agrees.

### Act 5 — her thresholds

She sets slow query to 250 ms and N+1 to 8, and checks that Insights and Problems
now flag with those numbers.

**Done when:** a 300 ms query is flagged and a 200 ms one is not; an N+1 of 9 is
flagged and one of 7 is not (or the screens say plainly why they are not).

**Outcome:** done, with one part not checked. Organization › Thresholds and hidden keys: Slow query 250, N+1 8, Save → "Saved. New data uses these settings."; values stay after leaving and coming back. Database now reads "Slow queries (≥ 250 ms)" and "Slow means ≥ 250 ms · Change" (#028). After Dani dropped a card at the top of Inbox (14 renumbers), Insights shows "N+1 query pattern · runs 14 times per request in POST /api/v1/boards/:boardId/cards/:cardId/move". Problems: "WizeLens is learning what normal looks like … needs two of them with data (it has 0)" — true, it does not use these limits. NOT CHECKED: a renumber of 5–7 (flagged at the old 5, not at 8). kanNINJA renumbers only when two cards clash on one place; 4 drops from the screen gave 14, 0, 0, 0 renumbers.

### Act 6 — is personal data leaking into SQL?

She opens the sign-up and sign-in traces from P01 and searches the cloud for
`p01.dani@kanninja.test` and for `Lantern-Orchard`.

**Done when:** no password or session token appears anywhere; email addresses in
SQL parameters are hidden, or she knows exactly where to turn that on.

**Outcome:** done after #029. Dani signed in twice (one typo `…-41!`, then right). Search for `p01.dani@kanninja.test` and for `Lantern-Orchard`: Requests 0 · Traces 0 · Spans 0 · Logs 0. Both sign-in traces (`d7c0e4ec…`, `be0c2829…`) on the SQL tab: the email lookup reads `params: ["[redacted]"]`, the new session's token reads `[redacted]`, the password hash column is selected but no result rows are kept. The realtime ticket (a signed pass with Dani's profile id and name) was in clear in every request URL — #029, fixed: now `ticket=v1.[redacted:signed-token]` with default settings, and Security › A09 flags it for kanNINJA.

### Act 7 — wake me up

She makes the two alert rules, then makes them fire (P01's 5,000-character list
name errors; a slow board load).

**Done when:** each rule shows it fired, the email for each is in the cloud's mail
log, and the link in the email opens that rule.

**Outcome:** done after #031–#036. Both rules fired and both emails are in the cloud log. `API error rate > 2% (5 min) — page Greta`: kanNINJA's database stopped for about a minute, `GET /api/auth/get-session` answered 500 (`connect ECONNREFUSED 127.0.0.1:5433`); "Error rate is 100% (above 2%)", 2026-10-27 09:34 UTC (02:34 America/Los_Angeles); mail "Alert: API error rate > 2% (5 min) — page Greta (kanninja-production)" with the link `#/alerts/0562113a-…?project=fb8ecf9e-…`, which opens the rule (signed in, and signed out through two-step sign-in after #035). `Slow SQL on the board load (≥ 250 ms)`: the database host stalled 0.9 s four times during board loads; "Slow queries is 2 (at or above 1)", 09:49 UTC; mail and link likewise; the slow shape is `auth_sessions` by token, max 634 ms (#036 puts it first).

### Act 8 — uptime and an SLO

She adds the uptime check and the SLO. Then she stops the kanNINJA API for two
minutes and starts it again.

**Done when:** the uptime check records the outage with the right start and end
times, and the SLO's budget moves by what she computes by hand.

**Outcome:** done for the uptime check after #037; the SLO part is blocked on a decision, #038. Check `kanNINJA API health — every 60 s`: the address in her notes, `/health`, answers 404 (kanNINJA's is `/api/health`); WizeLens said "Expected status 200-299, got 404 (failed twice in a row)" and, after #037, 0.00%. Edited to `/api/health`: Up, that incident Resolved after 2 min. API stopped 10:09:42–10:11:53 UTC (03:09:42–03:11:53 America/Los_Angeles): incident "Oct 27, 2026, 3:10 AM · 2 min · ECONNREFUSED at http://localhost:3001/api/health (connecting) (failed twice in a row)", Resolved; right to the minute, as a 1-minute check can be. Check page: 11 runs, 4 failed, 62.03% (time-based). SLO `Board API: 99.5% of requests succeed (30 days)`: before 98.6%, 509 requests, 2.8× spent; after 98.6%, 511 requests, 2.7× spent. By hand 511 requests, 7 failed = 98.63%, 7 ÷ 2.555 = 2.7×: the math is right, but the outage spent nothing, because the API answers no request while it is down (#038: the page now says so; how to count an outage is Brandon's call).

### Act 9 — least access

She invites Dani as a viewer on `kanninja-production`, invites Siobhán, then
cancels Siobhán's invite.

**Done when:** Dani (signed in as P01) sees the project and cannot change a
setting or make a key; Siobhán's invite link no longer works; the audit log lists
each step with Greta's name and the time.

**Outcome:** done after #039, #040 and #041. Invite p01.dani@kanninja.test as Viewer ("Reads all data."): link "works once, for 7 days", mail logged. Siobhán invited as Member, then cancelled: the question now reads Keep invite / Cancel invite (#039); her links (both) open "This invite link is not valid any more. Ask your team for a new one." Dani joined from the link (email filled in and locked to the invited address) and lands on kanninja-production Overview. As Dani: Connect says "Ask an owner or admin of your organization for one." (no key button); Organization › Thresholds shows 250 and 8, all inputs disabled, "Only owners and admins can change them."; People shows only Leave; Alerts and the alert rule page show no buttons. Her used invite link no longer works. Audit log: every step with Greta's or Dani's name; the cancel now names p03.siobhan@kanninja.test · as member (#040), and each row shows "Oct 27, 2026, 3:24 AM" with "1m ago" under it (#041). Machine timezone America/Los_Angeles (PDT).

### Act 10 — the key she revoked by mistake

During the 90-day rotation she revokes `kanninja-backend (API pods)` instead of
the old frontend key.

**Done when:** the cloud warned her what she was about to stop, she saw the API's
data stop, made a new key, put it in the env, and the gap in the data is under a
minute and visible as a gap, not as "0 errors".

**Outcome:** partly done: the warning after #042; the gap showed as 0 on the request chart, #043 (fixed: now a red "not sending" band and a break in the line). Revoke on `kanninja-backend (API pods)` asked "It was used 26s ago, so something still uses it. … To replace it with no gap, use Rotate instead."; she revoked anyway at 10:29:40 UTC. Seen stopping: Services › kanninja-backend "Offline", last seen 1m ago; the API log said "The hub at http://localhost:5970 refused the key (401). Check WIZELENS_HUB_TOKEN …". New key `kanninja-backend (API pods)`, expires in 90 days, made 10:33:06 ("Copy it now: it is not shown again. Set it as WIZELENS_HUB_TOKEN on the app."), set in backend/.env, API restarted; first new request 10:33:28 (22 s after the key). Gap in data: 10:29:40–10:33:28 = 3 min 48 s, NOT under a minute (the run took that long between revoke and the new key). Latency Over Time shows a break; Requests Over Time drew 0 through it (#043, fixed and re-proved: a red band, the line breaks). Later the same day she did the job she meant: Rotate on `kanninja-frontend (web pods)` ("The old secret keeps working for 24 hours"), the new secret into `frontend/.env.local`, web app restarted, the new secret used 40 s later, then the old one revoked: no gap. The log names both steps (#048).

### Act 11 — retention

She sets data retention to 14 days and reads what that means for the data she has.

**Done when:** the screen says in plain words what is kept and what is deleted,
and the audit log records the change.

**Outcome:** done after #044 and #045. Organization › Data retention: Days 30 → 14. The question: "Keep 14 days instead of 30 days? Traces and logs in every project from before Oct 13, 2026 are deleted within minutes. They cannot be brought back." (Keep 30 days / Keep 14 days). Her oldest data is from Oct 27, 2026 (she set up today), so by hand nothing is deleted now; the screen does not say how old her oldest data is. After saving, the top bar reads "Cloud · kept 14 days" at once (#044) and kanninja-production shows "Like the organization (14 days)" for traces and "Like traces (14 days)" for logs. The page now says logs can keep their own days (#045; the list offers up to 400). Audit log: "Changed the organization · keep data 14 days", with the date and time.

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

### Standing checks: results

- **Wrong moves.** Wrong key revoked (act 10, #042, #043). Double-click Save: two rules (#031, fixed); "Save SLO" twice made one. Cancel an invite after it was accepted: the accepted invite leaves Pending invites the moment Dani joins, so there is nothing to cancel and her access stays; her used link says "This invite link is not valid any more."
- **Reload and deep link.** F5 on the query page of `select … from "auth_sessions" where "auth_sessions"."token" = $?`: same address, same numbers (464 runs, p95 7.1 ms). The alert email link while signed out (act 7, #035, fixed). The query link opened by Dani in a fresh window: the same query page; signed out: Sign in, with the address kept.
- **Dates.** Machine in America/Los_Angeles (PDT, UTC-7). Outage 10:09:42–10:11:53 UTC shows as "Oct 27, 2026, 3:10 AM · 2 min" (first failed run): right. The 30-day SLO chart starts Sep 27 (Oct 27 − 30): right. Retention 14 days names "before Oct 13, 2026" (Oct 27 − 14; the run happened on 2026-10-27, not 10-26): right. Not checked: anything across the 2026-11-01 DST change. 7-day charts label Oct 20–Oct 25 and leave today unlabelled at the right edge (noted).
- **Numbers at the edges.** SLO: 511 requests, 7 failed = 98.63%; budget 0.005 × 511 = 2.555, spent 7 ÷ 2.555 = 2.7× — the screen says 98.6% and 2.7× (act 8). Uptime 2 of 2 failed = 0% after #037. Not checked by hand: the 25% error rate the rule fired at during the act 8 outage.
- **The other side.** Dani as viewer opened the alert rule: same rule, chart and notices, no buttons (act 9).
- **Without a mouse.** Rule 1 made keyboard-only from Overview (act 7).
- **Somebody else's data.** Search over 30 days for `Harrow & Vance`, `hv-bookings`, `p00.harrow`: 0 requests, traces, spans and logs each; control search `realtime-ticket`: 99 requests. Neighbour trace `82e5317a0665a2a7b2b4726c742fa781`: "This trace is no longer stored." (does not say it exists). Switcher, as Greta and as Dani: one organization, one project. No leak.

---

## Verification

Filled in at the end, honestly, **including what was skipped** (RULE #4).

| | Result |
| --- | --- |
| Acts completed | 11 of 11 with a recorded outcome: 1–7, 9 and 11 done; 8 done (uptime, and its outages on the SLO page after #038); 10 partly done (warning fixed, gap 3 min 48 s not under a minute; the gap now drawn as a gap, #043); the rotation done right afterwards with no gap |
| Issues filed | 26: #024–#049 (blocker 0, major 10, minor 11, design 3, copy 2). #050 was found by the P01 regression check at the end of this run |
| Issues fixed and confirmed | 26 of 26, each with a confirmation line from the screen; the shared ones also re-proved in P01's in-app dashboard (#027 #028 #029 #034 #036 #044 #046 #047 #049) |
| Issues blocked, and on what | None. Decided 2026-10-27: #038 option C, #043 do it, #045 logs may outlast the trace days up to the plan's max |
| Screens scored | 26 cloud screens in light 1440, dark 1440 and 360 (rating.md: 45 of 177 scored overall). Scoring found #046–#049. Sign in, Create account, two-factor and invite seen in light only: not scored |
| **Not checked** | an N+1 of 5–7 against the limit 8 (act 5); the 25% error rate by hand (act 7); anything across the 2026-11-01 DST change; data really deleted after 14 days (act 11); a real inbox (no mail service, so the cloud log only); #031 and #039 in P01's in-app dashboard (it has no such form) |

### The numbers

| Record | Result |
| --- | --- |
| Minutes from cloud sign-up to the first kanNINJA trace | 20 (00:36:46 → 00:56:25 America/Los_Angeles), including fixes #025 and #026 |
| Speed at real volume (100+ requests, 2 services) | 1,036 requests, 1,095 traces, 2 services and the browser: first row on Requests 49 ms, Services 48, Database 96, Errors 110, Traces 205; Requests page 2 of 70 in 68 ms (local cloud on PGlite, one machine) |
| Alerts fired / emails logged | 2 rules fired (error rate at 100% and at 25%; slow SQL once) / every fire and resolve mail is in the cloud log, and each link opens its rule |
| SLO budget (hand vs. screen) | 511 requests, 7 failed: 98.63% and 7 ÷ 2.555 = 2.7× by hand; 98.6% and 2.7× on screen. The 2-minute outage spent nothing (#038) |

---

## Run log

Written act by act **as you go**, not reconstructed at the end. Each entry: what
you did, what you saw, what you decided. Quote the exact words on screen — the
sentence is often the defect.

**Act 1.** Before the run, the neighbour was set up through the UI: the setup link made Imogen Harrow-Vance (p00.harrow@harrowvance.test) the first account; org renamed to `Harrow & Vance Studio`, project `hv-bookings`, ingest key `hv-bookings-api`, and a small Node service of that name sent 13 traces with SQL on `hv_bookings` and log lines naming the studio (neighbour trace `82e5317a0665a2a7b2b4726c742fa781`). On the way, Make a sending key started on `My app` while the top bar said `hv-bookings`: filed #024 (major), fixed, re-proved. Greta: home → Cloud → Pricing. Both "Start free" buttons go to https://app.wizelens.com; the local cloud on :5970 stands in for it. Signed out, the cloud page asks for traces and services and gets two 400s in the console (invisible on screen; noted, not filed). "Create an account" → name, email, password → straight onto an empty Overview of "Greta Lindqvist-Ochoa's team" / "My app". Account › Sign-in and security › Two-step sign-in › Turn on → password → a key to type ("Cannot scan?") and 10 backup codes → a code from the app → "Two-step sign-in On". Signed out and in: password, then "Two-step sign-in · Enter the 6-digit code from your app · Trust this device for 14 days".

**Act 2.** Organization › General: name saved. Projects: the `My app` row had Access, Clear data and Delete, no rename: filed #025 (major), fixed (Rename on each row, PATCH takes a name, audit "Renamed a project · was My app"), re-proved. Connect › Make a sending key: the form started on kanninja-production (the one project; #024 fixed earlier). Both keys made with Expires "Never" — Greta rotates by hand every 90 days. The setup answer "Environment production" had no home: Connect and the Configuration docs never said which setting names a service's environment: filed #026 (copy), fixed in both, re-read.

**Act 3.** Each key went into its service's env file (`backend/.env`, `frontend/.env.local`, both git-ignored) as WIZELENS_HUB=http://localhost:5970 and WIZELENS_HUB_TOKEN; both services restarted. Dani loaded the board once. Overview: "Total Requests 16 · SQL Queries 36 · Apdex 0.75 Fair"; both services "Degraded" from first-compile times (1.7 s, dev server). Recent Requests shows the realtime call with its whole `?ticket=v1.eyJ…` value — a signed ticket holding Dani's profile id and name: kept for act 6. Traces → `/api/v1/boards/c2be23b0…` → Open trace: TOTAL 658 ms = fetch 338 + render 321 (rounding), 9 spans, 7 queries.

**Act 4.** Sorted by "Most total time" (the Order select, URL keeps `sort=total`). First look: the row and the Query page gave Avg and Max only — no p95, the number her act asks for: #027, fixed (histograms for `db.q`/`db.qd`, FACTS_VERSION 14, P95 column + CSV + Query page head), cloud restarted, stats rebuilt from stored traces without loss. The costliest shape is the auth lookup that every API request does (Better Auth session → user), 7 of 7 endpoints — so the fix for kanNINJA is caching the session user per request, not an index (lookups are by primary key, 2.8 ms each). The trace's SQL tab shows the session token param as `[redacted]` and the user id param in clear.

**Act 5.** Greta looked for the limit on Database first; only chart labels named it (#028, fixed: a Change link by the limit). The thresholds page says changes apply to new data only — the 14-call N+1 came after the save. No query reached 250 ms (the slowest is 41 ms), so "Slow 0" is right and was not provoked. The in-app HUD still uses its own default 5 (it showed the same N+1 as "ran 14 times"); the two limits are separate on purpose, but nothing on either screen says so — noted, not filed.

**Act 6.** Email hiding is on by default (SQL values bound to an `email` column); nothing on the Thresholds page says so — she learned it from the trace, not the settings. Still in clear and deliberately not filed here: the session insert's `ip_address` (127.0.0.1) and `user_agent`, and user ids. IP addresses are personal data in the EU; they belong with the open #019 decision (what personal data to mask by default). The ticket values stored before the fix stay as they were (they expire in about 95 s).

**Act 7.** Rule 1 was made keyboard-only from Overview (23 Tabs to Alerts, the focus ring on every stop); rule 2 by mouse. Wrong moves: double-clicking Save made the rule twice (#031); Delete removed the double with no question (#032). P01's 5,000-character list name gave a 400 and a Web App `ApiClientError`, and rule 1 stayed OK: right (a 4xx is the caller's mistake), but the form did not say what counts (#033). "View the traces" listed the outage requests as Aborted while the trace said 307 (#034). With no traffic the rule resolved as "Error rate is not measured (no longer above 2%)", fired again at 25% on the second outage, and resolved at 0%. Eight board loads at once did not make slow SQL: waiting for the one connection is not counted as query time (avg 4.5 ms), which is right. Wrong error group: she resolved `ApiClientError: Validation failed` instead of `ECONNREFUSED`; the row left the list but the detail stayed with "Resolved" and "Reopen" in place; she reopened it and resolved the database one. The email gives the time in UTC only. Not checked: whether the remembered custom time window on Database (it kept 09:36–09:51 UTC from an earlier click) confuses a later visit.

**Act 8.** Double-clicking "Save SLO" made one SLO (#031 holds). Deleting the check asked first (#032 holds on Uptime). While the API was down Dani got the kanNINJA sign-in page twice, with no word that the service was down (a kanNINJA gap). Incident times show to the minute only.

**Act 9.** The "Role" list in the invite form is a wrapped label, fine for screen readers. The alert page as Dani lists "Resolved · Error rate is not measured (no longer above 2%)" from act 7: true words, but "resolved" on no data is worth a look (not filed).

**Act 10.** The cloud does not say anywhere that a revoked key is still being used to send; only the app's own log says so (in #043, optional part).

**Act 11.** Not checked: data really being deleted after 14 days (her data is less than a day old). Whether logs should be capped at the organization's days is a decision (#045).

**Scoring.** 26 screens shot as Greta in light 1440, dark 1440 and 360, side by side. At 360 the alert, SLO and key tables broke words into single letters (#047) and the error page ran its buttons off the screen (#049); the audit log said "Revoked a key" with no name (#048). All three fixed and re-shot. The screen list (gen-screens.mjs) had no row for the uptime check and service pages she used; it now counts every detail page (169 → 177). A new error after a web-app restart, `TypeError: RequestInit: Expected signal ("AbortSignal {}") …`, is Next.js's own dev telemetry: it passes its own AbortSignal ponyfill to Node's fetch and hides the failure. WizeLens records it truly; not ours, not filed.

**RULE #7.** The shared fixes were re-proved in P01's in-app dashboard, with kanNINJA refreshed to the new core, node and ui. On the API's own dashboard the hidden ticket held, but the live-updates WebSocket read "Aborted 6.06 s" each time Dani left a board: #050, filed as P01, fixed, re-proved (now "101 · 0.80 ms").

**RULE #7, after the decisions (2026-10-27).** The fixes for #005, #019, #038, #045, #013 and #043 touched shared parts: the bar list, the chart bands and redaction. Re-proved in P01's in-app dashboard with kanNINJA refreshed to the new ui: Database › Query Duration Breakdown in light, dark and 360 px, no sideways scroll. The #013 change (name column 45%) had made the bars short beside short names like SELECT; fixed in the same pass (the list is one grid, the name column fits the longest name up to 45%), re-shot: SELECT to OTHER on wide bars, and on the error page "Chrome on Windows 1, Not recorded 7" with the name in full. The SLO page still draws its uptime bands (#038), now titled "<check> down" beside the services' "<service> not sending" (#043). Redaction (#019): the API dashboard's Logs, last 24 hours, read "to: [redacted:email] subject: … is your" on the mail line, and no raw email address shows on the page.
