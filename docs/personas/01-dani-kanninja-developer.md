# P01 — Dani Okonkwo-Brennan · kanNINJA web team

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-26

**Status:** done
**Run:** 2026-10-26 (America/Los_Angeles, UTC-7), Claude driving Chrome
**Role:** developer · in-app dashboard + HUD (Node API + Next.js web)

## Account

| Field | Value |
| --- | --- |
| kanNINJA email | `p01.dani@kanninja.test` |
| Password | `Lantern-Orchard-42!` |
| kanNINJA clan | `Brennan & Okafor Joinery — Ops` |
| Board URL | http://localhost:3000/dojo/c2be23b0-868c-407f-bd45-adc4592e8a7a/board |
| WizeLens dashboards | http://localhost:3000/_wizelens · http://localhost:3001/_wizelens |

Fill these in as soon as signup gives them to you. A run nobody can revisit is a
run nobody can confirm.

## The person

Dani Okonkwo-Brennan, 31, they/them. Seven years of TypeScript; the second
engineer at kanNINJA after the founder. They own the Next.js web app and half of
the Fastify API, and they ship four or five times a week.

**Technical level.** High. Reads a flame chart, knows what an N+1 is, has used
Sentry, Datadog and (once, in 2015) Glimpse. Has no patience for a tool that
needs a sales call or a YAML file to say hello.

**What they are nervous about.** A 40-person clan demos kanNINJA to their own
client on Monday, and Dani cannot afford to guess at why their board is slow —
a wrong guess costs the weekend.

**What made them look today.** A user wrote "moving a card on our big board
takes forever"; Dani searched "glimpse for next.js" and landed on wizelens.com.

## The business

**kanNINJA** — a kanban SaaS (Next.js 15 web, Fastify 5 API, Drizzle on
postgres.js, Better Auth), driven by people and by their own AI agents over MCP.

- The biggest real board has 64 cards in 6 lists, 9 labels, and 23 members
- The API runs on a 10-connection pool against a small Postgres; one slow query
  path starves everything else
- **Inconvenient for the software:** kanNINJA already ran WizeLens 0.3.0-alpha.10;
  Dani must upgrade to the latest without losing what worked, and the API and web
  app are two services that must land in one trace

## Why they are here today

1. "Somebody says the board is slow. I want to see the actual SQL a board load runs."
2. "I want the click in the browser and the API call it made in one picture."
3. "If our AI agent can read this, it must never see a password or a session token."

## Setup answers

| Question | Answer |
| --- | --- |
| Stack picked on the site | `Next.js` (web) and `Node.js` (API) |
| Package manager | `pnpm` |
| HUD | on, development only |
| Upgrade path | from `0.3.0-alpha.10` to the latest the site names — record which |

## The data

**This is the test data. Type it as written** (RULE #2).

### The clan and the board

| Field | Value |
| --- | --- |
| Clan | `Brennan & Okafor Joinery — Ops` |
| Board | `Q4 Workshop Fit-Out: Müller Kitchens, St. Agnes' Hall & the Tōkyō pop-up` (74 characters) |
| Lists | `Inbox`, `Measured`, `In the shop`, `Finishing`, `Waiting on client`, `Done` |
| Labels | `urgent`, `oak`, `walnut`, `ash`, `Müller`, `St. Agnes'`, `Tōkyō`, `install`, `snag` |

### Cards (at least 64; the first 16 typed exactly, the rest numbered from these)

| # | Card | List | Label | Due (America/Los_Angeles) |
| --- | --- | --- | --- | --- |
| 1 | `Müller — template the 3.2 m island worktop (oak, 40 mm)` | Measured | `oak`, `Müller` | 2026-10-31 23:59 |
| 2 | `St. Agnes' Hall: 14 pew ends, re-glue & re-wax` | In the shop | `St. Agnes'` | 2026-11-01 06:00 |
| 3 | `Tōkyō pop-up — counter front, ash slats @ 18 mm pitch` | Inbox | `Tōkyō`, `ash` | 2026-11-30 |
| 4 | `Order 42 × M8 threaded inserts (£0.37 ea, +VAT)` | Inbox | | 2026-10-27 |
| 5 | `Snag list: drawer 3 rubs on runner — Mrs O'Sullivan` | Waiting on client | `snag` | overdue: 2026-09-16 |
| 6 | `Walnut veneer: book-match 6 leaves, sequence #A-114` | In the shop | `walnut` | 2026-11-02 |
| 7 | `Install day — Müller kitchen, Hauptstraße 12, Visalia` | Finishing | `install`, `Müller` | 2026-11-04 18:30 |
| 8 | `Price the St. Agnes' lectern repair (quote Net 15)` | Inbox | `St. Agnes'` | 2026-10-28 |
| 9 | `Re-sharpen planer knives (Hitachi, 3 × 310 mm)` | Done | | — |
| 10 | `Client call: +44 20 7946 0958 re: Tōkyō shipping crate` | Waiting on client | `Tōkyō` | 2026-10-29 09:15 |
| 11 | `Finish samples — Osmo 3032 vs. Rubio Monocoat "Pure"` | Finishing | `oak` | 2026-10-30 |
| 12 | `Ash slats: 212 pieces, 18 × 44 × 900 — kiln check 8–10% MC` | Measured | `ash` | 2026-11-03 |
| 13 | `Fix the "Done" column's 0-day ageing bug in our own tracker` | Inbox | `urgent` | 2026-10-26 |
| 14 | `Leap-year job number reset — 2028-02-29 test card` | Inbox | | 2028-02-29 |
| 15 | `Deliver offcuts to Visalia Unified woodshop (free)` | Done | | — |
| 16 | `Describe the island: a 3.2 m oak island with a 40 mm worktop, a waterfall end on the window side, two 600 mm drawer banks, an integrated bin, a 50 mm overhang for four stools, and a hidden cable channel for the induction hob's flex — templated on site, cut in two halves, and biscuit-joined on install day.` | Measured | `Müller`, `oak` | 2026-11-05 |

Card 16's title is also its description; it wraps to five lines at 360px.

### Members

`Dani Okonkwo-Brennan`, `Siobhán O'Callaghan`, `Kwame Asante-Ruiz`, `Zoë Ng`
(four people, so the members list has an apostrophe and an accent).

---

## The setup they leave with

**This list is the definition of done** (RULE #8). Every item, built and working,
before the run is `done`.

| Item | What it must have |
| --- | --- |
| kanNINJA on the latest WizeLens | the API, the web app and the browser on the version the site names, from the site's own instructions |
| One trace per click | moving card 1 is ONE trace: the browser fetch, the web server and the API request in a single timeline |
| The board load's SQL | every query of one board load visible, with the slowest named and its count matching a hand count |
| The N+1 named | the dashboard's insight names the repeated query shape (or says there is none) and links to it |
| A before / after | a trace compare link showing the board load before and after Dani's change |
| An error, found and closed | the error from act 7 found in Errors with its stack, marked resolved |
| A safe AI key | the dashboard's AI access on, and a check that the agent sees no password, token or email in SQL or logs |
| The HUD reads right | on the board page the HUD shows the page (not one call), Server and DB add up, details list every call |

**Working end to end:** a teammate opens Dani's trace link tomorrow and sees what
Dani saw, without being told where to click.

**The look.** A developer's local workbench: dense, fast, keyboard-first, the
in-app dashboard on two services and the HUD on one page.

**Also required:** both themes, 360px, keyboard only for one full job, and every
link Dani shares opens the same place in a new window.

---

## The run

### Act 1 — find WizeLens and decide it is worth ten minutes

Dani opens wizelens.com, reads the home page and the Next.js page, and looks for
"what do I run". They want the install in under a minute of reading.

**Done when:** Dani has the exact install command and the version from the site,
and can say in one sentence what WizeLens will show them.

**Outcome:** done. Install command `npm install @wizeworks/lens-node` (+ `@wizeworks/lens-react`), newest version 0.3.0-alpha.13 (from /changelog). One sentence: "it shows the SQL and the API call behind each click, in one timeline". Issue #001 fixed on the way.

### Act 2 — upgrade kanNINJA from alpha.10

Dani follows the site's Next.js and Node docs for an app that already has
WizeLens: bump the packages, keep `instrumentation.ts`, keep the Fastify plugin.

**Done when:** both services start, both dashboards open, and the version each
dashboard shows matches the site.

**Outcome:** done. Both services started on the local 0.3.0-alpha.13 build; http://localhost:3001/_wizelens and http://localhost:3000/_wizelens open, each shows "v0.3.0-alpha.13" at the foot of the menu and "In-app · kanninja-backend / kanninja-frontend · kept 24 h" in the top bar.

### Act 3 — make real data: the board

Dani signs up to kanNINJA as `p01.dani@kanninja.test`, makes the clan and the
board above, and enters the cards. This is the traffic WizeLens will see.

**Done when:** the board shows 64+ cards across 6 lists; `/_wizelens` on both
services shows the requests that made them.

**Outcome:** done. Account p01.dani@kanninja.test (code read from the API log), clan "Brennan & Okafor Joinery — Ops", board at /dojo/c2be23b0-868c-407f-bd45-adc4592e8a7a with 6 lists and 64 cards (16 typed as written, 48 numbered). Labels, due dates and members were not set (kanNINJA screens, not WizeLens). #002 found and fixed.

### Act 4 — read the HUD on the board

On the board page Dani reads the HUD: Total, Server, Database, Fetch. They open
the details and pick the API call that loaded the cards.

**Done when:** the HUD names the board page (not the last API call), Server and
DB are the sum of the page and its calls, and the details link opens that trace.

**Outcome:** done. HUD named the page GET /dojo/c2be23b0-…/board (a route change, so no page row; "Route render" first). Hand sums of the 5 call traces matched: Server 18+12+15+12+6.1 = 63 ms vs HUD 62 ms (rounding); DB 14+9.5+12+9.3+3.7 = 48.5 ms vs HUD 48 ms; SQL 7+5+6+5+4 = 27 vs HUD 27. Each details link opened its own trace. #003 found and fixed (twice: the first proof read text, not the screen).

### Act 5 — one click, one trace

Dani drags card 1 from `Measured` to `In the shop` and finds that move.

**Done when:** one trace holds the browser fetch, the web app and the API request,
with the SQL of the move inside the API span.

**Outcome:** done after #004. Card 1 moved Measured → In the shop. The HUD link opens http://localhost:3000/_wizelens/#/traces/d75088eb9b87ea0e227ea2a6fecd7951: browser fetch 40 ms → POST /api/v1/boards/:boardId/cards/:cardId/move 8.3 ms → 7 SQL (SELECT auth_sessions … UPDATE cards … SELECT integration_connections), 9 spans. There is no web-app hop in this click: kanNINJA's browser calls the API directly, so "the web app" in the done-when does not apply.

### Act 6 — what does a board load cost in SQL?

From the board-load trace Dani opens the SQL tab, then Database and Insights.

**Done when:** Dani counts the SQL calls by hand from the SQL tab and the
dashboard's count agrees; the slowest query and any N+1 are named and link to
the query shape.

**Outcome:** done after #008, #009 and #010. Board-load trace e96bbb3f…: 7 SQL rows counted by hand = QUERIES 7 = tab "SQL 7" = "7 queries · 7 unique"; row times sum 10.83 ms = DATABASE 11 ms. Slowest query (`select … from "auth_users" where "auth_users"."email" = $?`, 7.2 ms avg) opens its shape page from Database, keyboard only, in 20 keys. Insights names the N+1 (`update "cards" set "order_index" = $? …`) and links to its example trace.

### Act 7 — break it, then find the break

Dani renames list `Waiting on client` to a 5,000-character paste, then opens a
card that another tab already deleted. Whatever errors, they find it.

**Done when:** each error is in Errors with its stack and request, and Dani
marks the real one resolved.

**Outcome:** partly done. The 5,000-character rename was refused (400) and is in Errors as "ApiClientError: Validation failed · /dojo/{}/board · Web App · 6", with its stack (`api-client.ts:38:15`) and the HUD showing 400 and "1 Error" at once. The deleted card made no error to find: kanNINJA answers its old link with a 200 "This kata is sealed" page. Marking it resolved is not possible in-app; the screen now says so and where (#012). Browsers on the error page stay empty for browser errors (#013, blocked on scope).

### Act 8 — the mistake Dani has to undo

Dani resolves the wrong error group (the 4xx, not the 500), notices, and wants
it back.

**Done when:** the wrong group is unresolved again and the real one stays
resolved, and the list says which is which.

**Outcome:** not run in-app: the in-app dashboard keeps no issue states, so there is nothing to resolve or undo (see #012). The same wrong move — resolve the 4xx group, notice, reopen it — is done by P02 on the cloud.

### Act 9 — the before / after

Dani reloads the board twice, compares the two board-load traces, and keeps the
compare link for the team.

**Done when:** the compare link opens in a new window on the same comparison.

**Outcome:** done after #014, #015, #016 and #017. The link `#/traces/903f5c7f…/compare/03698c2c…` opens in a new window on the same comparison: Total 20 ms / 21 ms, 7 queries each, kanninja-backend 7.8 → 9.7 ms.

### Act 10 — let the AI agent read it, safely

Dani turns on AI access for the API's dashboard and checks what an agent would
see for the sign-up request.

**Done when:** the agent's view has no password, session token, or raw email in
SQL, headers or logs; and Dani can turn it off again.

**Outcome:** partly done. On, read and off all work from the screen after #018. The agent's view of a fresh sign-up has no password, hash or session token; two raw emails remain inside longer values — #019, blocked on a decision.

### Act 11 — logs for the move

Dani wants the API's own log lines for the card move from act 5.

**Done when:** Logs filters to that trace and shows the lines, and the trace's
Logs tab shows the same lines.

**Outcome:** done after #020. The act 5 move wrote no log lines of its own (Fastify's two are not kept), and both views now say so; a trace that did write a line shows the same line in Logs and in its Logs tab.

---

## What only this persona proves

The in-app spine: install or upgrade from the site's own docs into a real Next.js
+ Node app, the HUD on a real page, and one click as one trace across two services.

---

## Standing checks

**Wrong moves.** Paste 5,000 characters into a list name (act 7). Resolve the
wrong error group (act 8). Double-click "Create board" — does kanNINJA make two,
and does WizeLens show two POSTs?

**Reload and deep link.** F5 on a trace's SQL tab; open the trace compare link in
a new window; open `http://localhost:3001/_wizelens/#/database` straight from the
address bar.

**Dates.** Card 1 due 2026-10-31 23:59 and card 2 due 2026-11-01 06:00 in
America/Los_Angeles (UTC-7 now, UTC-8 after 2026-11-01): the times WizeLens shows
for the requests that saved them must match the machine clock.

**Numbers at the edges.** Add the spans of the act 5 trace by hand and compare with
its total; count the board load's SQL calls by hand and compare with the HUD's
DB count and the N+1 count.

**The other side.** Siobhán O'Callaghan opens Dani's trace link and compare link
in a fresh window: she must land on the same trace, not the overview.

**Without a mouse.** Act 6, keyboard only: from the dashboard home to the slowest
query's shape page, focus visible all the way.

**Somebody else's data.** Search the dashboard for `Harrow & Vance` (P02's
neighbour org on the cloud): the in-app dashboard holds only this app's data, so
nothing may come back. Then paste a trace id from the kanNINJA API's dashboard into
the web app's dashboard and say what happens.

---

## Verification

Filled in at the end, honestly, **including what was skipped** (RULE #4).

| | Result |
| --- | --- |
| Acts completed | 8 done (1–6, 9, 11) · 2 partly (7: found, not closed in-app; 10: #019 open) · 1 moved to P02 (8: the in-app host keeps no issue states) |
| Issues filed | 23 (#001–#023) |
| Issues fixed and confirmed | 20 — every one re-run as Dani on the screen that found it |
| Issues blocked, and on what | #005 decision (own-code time after the response), #013 scope (browser errors carry no user agent), #019 decision (emails inside longer values reach the agent) |
| Screens scored | 19 of 169: 4 site, 13 in-app dashboard, 2 HUD — light, dark and 360 px (site light only: it has no dark theme) |
| **Not checked** | Query shape page (opened in act 6, no score sheet); Error group detail (the sheet caught the Errors list); Problems, Rendering, Metrics, Services, Security, Users, Settings (not opened by Dani); labels, members and due-date times on cards (kanNINJA date fields take days only); minutes from install to first trace (see below) |

### The numbers

| Record | Result |
| --- | --- |
| Minutes from install to the first trace | not checked: the upgrade used local tarballs and a `.next` rebuild, so no clean clock from `npm install` |
| Speed at real volume (64 cards, 100+ requests) | 64 cards, 1,354 requests, 1,400 traces, 4,738 SQL. Lists page past the first; filters answer as Dani types (#014). Not timed with a clock |
| SQL calls in one board load (hand count vs. dashboard) | 7 by hand = QUERIES 7 = "SQL 7" tab = "7 queries · 7 unique"; row times 10.83 ms = DATABASE 11 ms |
| Spans in the act 5 trace (hand sum vs. total) | fetch 40 + render 30 = 70 ms = TOTAL 70 ms; SQL 6.62 = Database 6.6 ms; own code 1.7 vs 2.4 ms (#005) |

---

## Run log

Written act by act **as you go**, not reconstructed at the end. Each entry: what
you did, what you saw, what you decided. Quote the exact words on screen — the
sentence is often the defect.

**Act 1.** Home → Platforms → "React and Next.js" → "Set it up" landed on the React (Vite) guide, not Next.js: filed #001, fixed (hero now has React setup + Next.js setup), re-proved. The home page's live demo first showed only the logo on a black box; on reload it played (dev server compiling on first hit), so not filed. Version from /changelog: the first chip is 0.3.0-alpha.13. The site has no dark theme; site screens scored light only.

**Act 2.** The upgrade was done by pointing kanNINJA at the local tarballs (same as `npm install` of the newest version) and deleting `.next` once, as /docs/nextjs says. Both dashboards opened empty with "No requests in this range — Use your app and requests show up here."

**Act 3.** Signup in the real Chrome was blocked by a password-manager extension popup on every field; switched to a clean headless Chromium (Playwright, America/Los_Angeles). HUD read "GET /dashboard 201" after making the board: filed #002, fixed, re-proved. The re-run's double-click on "Open dojo" made TWO boards — a kanNINJA defect, not WizeLens (reported to Brandon, not fixed here). After 64 cards on one page the HUD read 2228 SQL, 325 Fetch, 13 Insights.

**Act 4.** HUD details listed every call as "GET http://localhost:3001/a…": filed #003, fixed by naming calls by their server route, re-read — the TEXT was right but on screen the 165 px column still cut /members and /clans. Second fix keeps the last path segment in view; proven on screen in act 5. The details panel stays open across reloads and covers the right third of the board; it got in the way of a drag once (noted, not filed: closing it is one click).

**Act 5.** First link opened the API's dashboard with only the API half (8 spans): filed #004 (major), fixed with one rule for where spans go and where links point, re-proved. Span hand sum: fetch 40 + render 30 = 70 = TOTAL; SQL 6.62 = Database 6.6; but Server code 1.7 vs timeline self 2.4 — the last query ends 0.67 ms after the response: filed #005, blocked on a decision. Moving card 1 BACK into Measured (10 cards) cost 18 SQL vs 7 forward — kanNINJA re-numbers the target list one UPDATE per card. The trace page named it: "N+1 query: ran 10 times · update \"cards\" set \"order_index\" = $1 where \"cards\".\"id\" = $2 · 43 ms" (a kanNINJA finding for Brandon; WizeLens did its job).

**Act 6.** The SQL tab showed the live session token in `params: ["AIJDis…"]` for `"auth_sessions"."token" = $1`: filed #008 (major), fixed in TS by reading which column each placeholder binds to (named placeholders too, shared vectors in docs/redact-vectors.json), the Go, Python and .NET port is tracked in #008; re-read: row 1 now `["[redacted]"]`, rows 2–3 keep the user id (`"auth_users"."id"`, not a secret). Without a mouse, Tab skipped every query row on Database (60 Tabs, only the Endpoint links): filed #009, fixed with one `pressable` helper for table rows, list items and map shapes; re-proved, ring visible. Insights said "runs 7 times per request" while the trace Dani knew said 10 — 7 is 99 repeats ÷ 14 requests: filed #010 (minor), now "7 times per request on average".

**Act 7.** Rename `Waiting on client` to a 5,000-character paste of Mrs O'Sullivan's email: kanNINJA kept the edit box open with no message and threw an unhandled "Validation failed" (a kanNINJA gap for Brandon). The HUD went red, 400, "1 Error". The second tab could not reach the last card in `Done`: the HUD bar covered its menu and the list could not scroll further: filed #011, fixed with "Show WizeLens bottom left" in HUD Settings, re-proved (card deleted, Done 10 → 9). Tab A removed the card live, so the deleted card was opened from its kept link instead: "This kata is sealed. You may not have access, or the kata no longer exists." with HTTP 200, 2 SQL, no failed call (kanNINJA could answer 404). Errors had the rename error with stack; no Resolve and no reason: filed #012, fixed with a line that says Resolve and Ignore are on the hub and in the cloud, with a How link. "Browsers: No user agent recorded" on a browser error: filed #013, blocked on scope (needs the user agent in the error facts, a ClickHouse change). The other Errors rows (ENOENT `.next/routes-manifest.json`, "Jest worker …") are from my own web-server restarts, not Dani's app.

**Act 8.** Act 8 needs Resolve and Reopen. The in-app host has no `issues` capability (CONTRACT.md: hub and cloud only); since #012 the screen says so. Moved to P02.

**Act 9.** First pass compared two `GET /api/v1/realtime` traces: the Traces search did not filter as Dani typed (#014), and Dani took the unchanged top row. With the search fixed, the list showed the board's four calls, but each path filled nine lines (#016) and the board load sat below the fold. Compare's "Same request, newest" listed the board loads at 48–52 ms while the list said 17 ms: the page and API are cross-origin, so the API span had no parent and the clock fix never ran (#015). After the fixes, the menu reads 21 / 18 / 19 ms, and the two 315–321 ms loads in it are real (the fetch waited; the API answered in 10 ms). At 360 px the page scrolled 64 px sideways from the pager (#017, every paged list). Six 404s seen in the console on the first (realtime) compare did not come back on the board-load compare; not reproduced, not filed. Compare's Total adds the page render to the fetch, by design.

**Act 10.** Connect said "AI access (MCP) Off" with no way on (#018, fixed: the row now names `enableMcp: true` and links the docs). With it on, an MCP client at `http://localhost:3001/_wizelens/mcp` listed 16 tools; `list_traces q=sign-up` found the request and `get_trace` returned it. Dani's own act-1 sign-up still holds the password hash, session token and email in clear, because it was stored before #008. Siobhán O'Callaghan then signed up through the kanNINJA screen (Necessary-only cookies, `p01.siobhan@kanninja.test`): in her trace every `email`, `password` and `token` column value is `[redacted]`, the `set-cookie` keeps only the cookie name, and `Lantern` appears nowhere. Her address is still in `auth_verifications.identifier` (`email-verification-otp-…`) and in kanNINJA's dev-mailer log line (#019). Every tool call wrote `[wizelens] mcp tool=… args=…` to the API log, as the docs promise. Turned off, the row read Off and the client got `MCP is disabled. Set enableMcp: true.`

**Act 11.** Logs search for the move's trace id `d75088eb…` showed "Log Patterns (52)" (unfiltered) above "Log Lines (0)" with an unrelated hint, and the trace's Logs tab said no lines, while the API terminal had `incoming request` / `request completed` for it (#020: the Node add-on drops those two Fastify lines by design, undocumented). After the fix the search says the patterns ignore text, the trace wrote no lines, and links it; the tab names the Fastify lines. kanNINJA writes few lines in requests: of 2,000 kept API traces only the two sign-ups hold one. Siobhán's sign-up `6cb9c75b…`: the same `[email:dev] RESEND_API_KEY unset…` line at 11:32:10 PM in Logs and at +77 ms in the trace.

**Standing checks.** Machine clock America/Los_Angeles (UTC-7).
- *Wrong moves:* 5,000-character list name (act 7: 400, in Errors with stack). Double-click "Create board": kanNINJA made two boards, and Requests shows both `POST /api/v1/boards 201` at 10:14:51 PM (11 ms, 10 ms) — WizeLens shows what happened; the double is kanNINJA's. Resolve the wrong group: moved to P02 (act 8).
- *Reload and deep link:* F5 on a trace's SQL tab keeps "SQL 7". `http://localhost:3001/_wizelens/#/database` opens straight on Database. The compare link opens on the same comparison in a new window.
- *Dates:* card 1 due 10/31, card 2 due 11/01 — kanNINJA's date field takes a day only, so 23:59 and 06:00 cannot be typed. Saves at 11:42:29 PM and 11:42:34 PM; Requests shows the same times. kanNINJA stores midnight UTC; the board still reads 10/31/2026 (a kanNINJA note for Brandon).
- *Numbers at the edges:* see The numbers above.
- *The other side:* Siobhán, in her own fresh window, opened Dani's trace link and compare link and landed on the same trace and the same compare.
- *Without a mouse:* act 6, home → Database → slowest query, after #009; focus ring visible all the way.
- *Somebody else's data:* search "Harrow & Vance" → 0 requests, traces, spans and logs. API trace `4e2ef6e9…` pasted into the web dashboard opens the merged trace (both services are Dani's app; by design).

**Scoring.** Every screen Dani used, captured light 1440, dark 1440 and dark 360. At 360 four screens scrolled sideways (#021) and every time chart's labels overlapped (#022); the HUD details cut the method and overlapped its axis (#023). All fixed and re-measured: 0 px sideways on 14 screens, no overlapping labels. Response bodies "Off" had the same gap as #018; fixed in the same component.

**Deliverable check.** On the latest version · one trace per click · the board load's 7 SQL · the N+1 named and linked · a compare link · the HUD reads the page — all present. The error is found with its stack but not closed in-app (P02 closes one on the cloud). AI access works and hides passwords, hashes and tokens; two emails inside longer values remain (#019, Brandon's decision).

**RULE #7, after P02.** kanNINJA refreshed with the cloud run's core, node and ui. In-app Overview, a `/board` trace, the newest error and Database fit at 1440 and 360 (#046 #047 #049); P95, "Slow means ≥ 100 ms · Change", "Most slow runs", the 307 redirects and the hidden ticket all hold (#027 #028 #029 #034 #036). The API's own dashboard listed the board's live-updates WebSocket as "Aborted 6.06 s" each time Dani left a board: #050 (major), fixed in the Node add-on, re-proved as "101 · 0.80 ms".
