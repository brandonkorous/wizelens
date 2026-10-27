# P01 — Dani Okonkwo-Brennan · kanNINJA web team

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-26

**Status:** in progress
**Run:** 2026-10-26 (America/Los_Angeles, UTC-7), Claude driving Chrome
**Role:** developer · in-app dashboard + HUD (Node API + Next.js web)

## Account

| Field | Value |
| --- | --- |
| kanNINJA email | `p01.dani@kanninja.test` |
| Password | `Lantern-Orchard-42!` |
| kanNINJA clan | — |
| Board URL | — |
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

### Act 5 — one click, one trace

Dani drags card 1 from `Measured` to `In the shop` and finds that move.

**Done when:** one trace holds the browser fetch, the web app and the API request,
with the SQL of the move inside the API span.

### Act 6 — what does a board load cost in SQL?

From the board-load trace Dani opens the SQL tab, then Database and Insights.

**Done when:** Dani counts the SQL calls by hand from the SQL tab and the
dashboard's count agrees; the slowest query and any N+1 are named and link to
the query shape.

### Act 7 — break it, then find the break

Dani renames list `Waiting on client` to a 5,000-character paste, then opens a
card that another tab already deleted. Whatever errors, they find it.

**Done when:** each error is in Errors with its stack and request, and Dani
marks the real one resolved.

### Act 8 — the mistake Dani has to undo

Dani resolves the wrong error group (the 4xx, not the 500), notices, and wants
it back.

**Done when:** the wrong group is unresolved again and the real one stays
resolved, and the list says which is which.

### Act 9 — the before / after

Dani reloads the board twice, compares the two board-load traces, and keeps the
compare link for the team.

**Done when:** the compare link opens in a new window on the same comparison.

### Act 10 — let the AI agent read it, safely

Dani turns on AI access for the API's dashboard and checks what an agent would
see for the sign-up request.

**Done when:** the agent's view has no password, session token, or raw email in
SQL, headers or logs; and Dani can turn it off again.

### Act 11 — logs for the move

Dani wants the API's own log lines for the card move from act 5.

**Done when:** Logs filters to that trace and shows the lines, and the trace's
Logs tab shows the same lines.

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
| Acts completed | |
| Issues filed | |
| Issues fixed and confirmed | |
| Issues blocked, and on what | |
| Screens scored | |
| **Not checked** | |

### The numbers

| Record | Result |
| --- | --- |
| Minutes from install to the first trace | |
| Speed at real volume (64 cards, 100+ requests) | |
| SQL calls in one board load (hand count vs. dashboard) | |
| Spans in the act 5 trace (hand sum vs. total) | |

---

## Run log

Written act by act **as you go**, not reconstructed at the end. Each entry: what
you did, what you saw, what you decided. Quote the exact words on screen — the
sentence is often the defect.

**Act 1.** Home → Platforms → "React and Next.js" → "Set it up" landed on the React (Vite) guide, not Next.js: filed #001, fixed (hero now has React setup + Next.js setup), re-proved. The home page's live demo first showed only the logo on a black box; on reload it played (dev server compiling on first hit), so not filed. Version from /changelog: the first chip is 0.3.0-alpha.13. The site has no dark theme; site screens scored light only.

**Act 2.** The upgrade was done by pointing kanNINJA at the local tarballs (same as `npm install` of the newest version) and deleting `.next` once, as /docs/nextjs says. Both dashboards opened empty with "No requests in this range — Use your app and requests show up here."

**Act 3.** Signup in the real Chrome was blocked by a password-manager extension popup on every field; switched to a clean headless Chromium (Playwright, America/Los_Angeles). HUD read "GET /dashboard 201" after making the board: filed #002, fixed, re-proved. The re-run's double-click on "Open dojo" made TWO boards — a kanNINJA defect, not WizeLens (reported to Brandon, not fixed here). After 64 cards on one page the HUD read 2228 SQL, 325 Fetch, 13 Insights.
