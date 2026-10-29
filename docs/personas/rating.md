# WizeLens — screen ratings

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-28

Every screen in WizeLens, scored on **Design** and **Ease** as the personas open
them. How and when to score is RULE #6 in [CLAUDE.md](CLAUDE.md); this file is
where the numbers live.

**Scored so far: 169 of 177 screens.** (2026-10-28: the runner's "dark" set only the browser's scheme while the dashboard keeps its own saved theme, so dark checks before 09:30 that day may have been light; every screen re-scored that day was checked again in true dark.) Update that line as rows fill in —
it is the denominator, and a rating file that does not show what it has not looked
at is the same lie as an empty issue list.

## The two axes

| Axis | The question |
| --- | --- |
| **Design** | Is it on-system and well-composed? Real components and tokens, real color doing real work (not a grey screen), hierarchy from scale and weight, holds at 360px, and the waiting / empty / error states all present and right |
| **Ease** | Could this person do the job without help? Findable, one home per concern, the data they need already on screen, no dead ends, words they use, an obvious next step — and reachable by keyboard and by thumb |

Both are reported. A beautiful screen nobody can operate is not an 8; a plain
screen that gets the job done in two taps is not a 4. Where one number is wanted,
quote the lower.

**Score it in light and dark and at 360px, or do not score it.** A number taken in one
theme at one width is a guess about the other three.

| Score | Means |
| --- | --- |
| 9–10 | Nothing to fix. A 10 needs a reason written in the gap column |
| 7–8 | Right, with named nits |
| 5–6 | Works; they needed a second look or a second attempt |
| 3–4 | They got there by persistence, or it looks unfinished |
| 1–2 | They would stop, ask somebody, or leave |

**The deductions are the point.** Every scored row carries a **gap to 10** — the
specific thing that would raise it. Anything in that column which is a real defect
becomes an issue and is fixed on the spot (RULE #3), then the row is re-scored
keeping both numbers: `5 → 8`.

A screen no persona reached stays `—`. **Never infer a score** from the code, from
a sibling screen, or from the fact that it typechecks.

## How to fill a row

| Column | What goes in it |
| --- | --- |
| Screen | as printed. A title computed from the record it holds is written "depends on what is open" |
| Key | the surface key or route — what the address bar uses |
| Design | `1`–`10`, or `4 → 8` after a fix |
| Ease | same |
| Gap to 10 | one short phrase. If it is a defect, add `#NNN` |
| Persona | who opened it — `P03`. Several may score the same screen; keep the latest and note the earlier in the gap column if it differed |

## Not a screen, and so not a row

Chrome every screen shares — a status bar, the nav menus, global search, a window
or tab title. Score each once in an issue and link to that issue from here, so the
judgment exists somewhere findable rather than not at all.

## Screens deliberately excluded

- **Hub-only screens.** `wizelens-hub` (the self-hosted collector) serves the same dashboard with a hub capability set. Neither persona runs a hub, so the hub is not a host in this roster.
- **Hosts with real infra data.** Needs the host collector on a machine. Kubernetes was scored on 2026-10-29 with sparx's production AKS (3 nodes, about 90 live pods).
- **Python, Java and Go add-ons.** No persona runs them. (.NET is P03's: eShopOnWeb on .NET 8, from 2026-10-27; its
  dashboard is the same screens as the in-app list, re-scored under "in-app on .NET" and not counted twice.)

They are not listed below and are not scored. **If a persona ever reaches one, that
is a `major` issue, not a rating.**

---


### Dashboard · in-app (/_wizelens) — 39 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Overview | `#/` | 8 | 7 → 9 | the subtitle takes two lines at 360 before the cards; was: "No data for previous day" on every card #139, cards pushed the first chart to 757 px at 360 #149, time axis overlapped at 360 #022; re-scored 2026-10-28 in light, true dark and 360 (cloud build, same screen) | P01 |
| Problems | `#/problems` | 8 | 8 | empty while it learns (says it needs two days of data); at 360 four zero cards come before the empty list | P06 |
| Search | `#/search` | 8 | 7 → 9 | a bare word does not look inside SQL params (`@wizelens.db.parameters:*x*` does); was: ran only on Enter #146, tabs and time axis overflowed at 360 #021 #022; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Requests | `#/requests` | 8 | 8 | Path cuts the end of long ids at 1440, so /clans and /members look alike; at 360 the filters fill the first screen | P01 |
| Traces | `#/traces` | 7 → 8 | 7 → 8 | at 360 four cards come before the list (it starts at 568 px, inside the first screen); was: list a third of the width #148, uptime runs filled the list #151, search waited for Enter #014, 9-line paths #016, cross-origin traces read long #015, pager overflowed #017; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Errors | `#/errors` | 8 → 9 | 7 → 8 | dev-restart ENOENT noise counts with app errors; Resolve lives on the hub/cloud #012; was: details out of view and "not in the selected time range" while loading #147; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Logs | `#/logs` | 7 → 8 | 7 → 8 | at 360 the lines start at 717 px, after cards, filters and the save line; was: "Errors 173" beside 65 exceptions (now "Error Lines"), unfiltered patterns #020; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Database | `#/database` | 8 | 8 | query text cut at 1440 with no wrap toggle; at 360 the filters fill the first screen | P01 |
| Rendering | `#/rendering` | 8 | 8 | at 360 By device page names wrap per letter group (/Baske / t) and Phone and Tablet are all dashes; Component Hotspots empty with a React-only hint on a .NET app | P06 |
| Metrics | `#/metrics` | 7 | 7 | at 360 22 metric names wrap at every dot in a narrow column (dotnet. / gc. / collections); a chart shows only after picking one, at the very bottom | P06 |
| Services | `#/services` | 8 | 8 | at 360 the Services table cuts Status at the right edge and the dependency map shows one box and cut labels; was: map buttons hidden from screen readers #198 | P06 |
| Insights | `#/insights` | 8 | 8 | Endpoints column cuts the route (/api/v1/boards/:boardId/cards/:c…); was: N+1 count read as exact #010 | P01 |
| Security | `#/security` | 8 | 8 | at 360 the OWASP grid is ten cards before the six risks; the risk table cuts each risk's text at the right edge | P06 |
| Users | `#/users` | 8 | 9 | at 360 only User and Requests show; Failed and Error rate scroll off the right | P06 |
| Connect | `#/connect` | 7 → 8 | 7 → 8 | settings change in code and need a restart, by design; .NET option names not seen on screen; was: rows named no option #150, Off with no way on #018, wider than a phone #021; re-scored 2026-10-28 on an in-app dashboard at 1440 and 360 (dark not seen) | P01 |
| Settings | `#/settings` | 8 | 8 | at 360 built-in tags' On column is cut to a box and the letter O; the Add a tag code box scrolls sideways; was: code box not keyboard reachable #199 | P06 |
| Connect › setup | `#/connect/setup` | 8 | 8 | one short card (Sends to the hub at localhost:5970, link to that dashboard); the tab row cuts Add-on options at 360 | P06 |
| Connect › server | `#/connect/server` | 8 | 8 | two long cards (Web, PublicApi) with 15 rows each; at 360 every setting is a label over a value over "set with" code; the redacted-keys chips repeat per service | P06 |
| Connect › Sending keys | `#/connect/keys` | — | — | — | — |
| Connect › AI read keys | `#/connect/read-keys` | — | — | — | — |
| Settings › Data retention | `#/settings/retention` | — | — | — | — |
| Settings › Thresholds and hidden keys | `#/settings/checks` | — | — | — | — |
| Settings › Tags | `#/settings/tags` | 8 | 8 | no tags yet, says add one with Tag this or in code; at 360 built-in tags On column cut to a box and the letter O; was: code box not keyboard reachable #199 | P06 |
| Settings › Preferences | `#/settings/preferences` | 8 | 9 | at 360 hint lines sit tight against the next label (Pages open with this range. / Time zone) | P06 |
| Connect › options | `#/connect/options` | 8 | 8 | 20 options in pages of 15 at 360; the Node column is only reachable by scrolling the table sideways | P06 |
| Trace › Timeline | `#/traces/<id>` | 8 | 8 | span bars under 1 ms are slivers; was: header actions overflowed at 360 #021 | P01 |
| Trace › SQL | `#/traces/<id>/sql` | 8 | 8 | long SELECT lists wrap to 3 lines with no collapse; params shown redacted as [redacted] with no column name | P01 |
| Trace › HTTP | `#/traces/<id>/http` | 8 | 8 | the browser page view row has no method and no status (dash), with nothing saying why | P06 |
| Trace › Messages | `#/traces/<id>/messages` | 8 | 8 | empty for eShop (no queue), says none were sent or handled | P06 |
| Trace › Logs | `#/traces/<id>/logs` | 8 | 7 → 8 | Service chip wraps to 2 lines in light at 1440; was: empty tab did not say Fastify's lines are left out #020 | P01 |
| Trace › Errors | `#/traces/<id>/errors` | 8 | 8 | empty for this request, says No errors in this request; the tab shows below a security finding card at 360 | P06 |
| Trace compare | `#/traces/<a>/compare/<b>` | 7 → 8 | 7 → 8 | at 360 the Numbers table fills the first screen before the two sides; was: Total said nothing of render (now "Total (call + render)"), "HTTP calls" beside an HTTP tab of 1 #153, "Same request" read 48 ms #015, waterfall overflowed #021; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Error group | `#/errors/<group>` | 8 | 8 | "Chrome on Wind…" cut at 360 with the full name only on hover; was: Browsers always empty for a browser error #013 | P01 |
| Service endpoint | `#/services/<svc>/endpoints/<ep>` | 8 | 8 | at 360 query text and Calls cut at the right edge; Errors lists two lines with no count | P06 |
| Query shape | `#/database/queries/<sql>` | 8 | 8 | at 360 the SQL title runs five lines in large mono before any number; Endpoints and Newest Traces cut at the right | P06 |
| Page route | `#/rendering/routes/<route>` | 8 | 8 | Hydration shows a dash with no word that this is not a React page; Components empty with a React-only hint | P06 |
| User | `#/users/<user>` | 8 | 8 | at 360 Errors They Hit and Slowest Requests cut text at the right edge; was: Tag this cut at the edge #200 | P06 |
| Service | `#/services/<svc>` | 8 | 8 | at 360 Calls cuts names into three lines; endpoint list is long mono with pages of 10 | P06 |
| Problem | `#/problems/<id>` | — | — | — | — |

P06 scored 20 of these on P03's eShop in four views (1440 and 360, light and dark). Not scored: Sending keys, AI read keys, Data retention and Thresholds are cloud and hub tabs; in-app their addresses show a note and the first tab (#201). Problem detail: eShop had no problem to open.

### Dashboard · in-app on .NET (eShop, /_wizelens) — same screens as the in-app list, not counted again

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Overview | `#/` | 8 | 8 | an EF Core database name reads "microsoft.s…" (full name on hover only); at 360 the six stat cards stack one per row before the first chart; was: Services card hid Status #052, Apdex cut "target 500 ms" #053, axis 0, 38, 75, 113, 150 #054 | P03 |
| Requests | `#/requests` | 8 | 8 | the request panel says "Rendering –" while the HUD showed "Render 75 ms" for the same page (act 6); at 360 the filters fill the first screen; was: 17 file rows per page load buried the pages #055 | P03 |
| Traces | `#/traces` | 8 → 9 | 7 → 8 | at 360 four cards come before the list; was: database time painted red #148, uptime runs #151; re-scored 2026-10-28 in light, true dark and 360 | P03 |
| Trace › Timeline | `#/traces/<id>` | 8 | 8 | spans under 1 ms are slivers; at 360 the facts stack two per row and the tabs start below the first screen; was: the browser chip read "browser" #078 | P03 |
| Trace › SQL | `#/traces/<id>/sql` | 8 | 8 | an UPDATE's params run three lines of small mono at 1440 with no wrap toggle; was: SecurityStamp shown #068, accents escaped #072 | P03 |
| Errors | `#/errors` | 8 | 7 → 8 | at 360 the two charts come before Recent Exceptions; was: menus filled the first screen (now behind one Filters button #119), "No data" on every card #139; re-scored 2026-10-28 in light, true dark and 360 | P03 |
| Logs | `#/logs` | 7 → 8 | 6 → 8 | at 360 the lines start below the first screen; was: an empty "Log Metrics" box (now one line), the chart before the lines; re-scored 2026-10-28 in light, true dark and 360 | P03 |
| Database | `#/database` | 8 | 8 | Rows Returned reads "–" for EF Core (a note says why); at 360 the filters come first; was: insight badges ran off the screen #074 | P03 |
| Services | `#/services` | 8 | 8 | 506 of Web App's 603 calls are Blazor's own `_framework` downloads; database names are cut to "microsoft.sql_serv…" on the map; was: map numbers on top of each other #076, a call hidden behind a box #077 | P03 |

### Dashboard · cloud — 70 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Overview | `#/` | 8 | 7 → 9 | P04's "Total Requests 2" note not checked again; was: "No data for previous 7 days" on every card #139, cards pushed the chart down at 360 #149, top bar ran off the screen #046; re-scored 2026-10-28 in light, true dark and 360 | P02, P04 |
| Problems | `#/problems` | 8 | 8 | empty while it learns (says why and for how long); at 360 four zero cards come before the empty list | P06 |
| Search | `#/search` | 8 | 7 → 8 | a bare word does not look inside SQL params (`@wizelens.db.parameters:*Peña*` does); P04: on a static site "Requests (0)" is the first tab while Traces holds her 117; was: ran only on Enter #146, top bar #046; re-scored 2026-10-28 in light, true dark and 360 | P02, P03, P04 |
| Requests | `#/requests` | 8 | 8 · 360: 6 | at 360 the filters fill the first screen; Path cuts long ids at 1440; was: top bar #046; P04 at 360: six filters fill the first screen; on a static site its only rows are two script reads stored before #093 | P02, P04 |
| Traces | `#/traces` | 7 → 8 | 7 → 8 | at 360 four cards come before the list; was: list a third of the width #148, uptime runs filled the first page #151, empty preview said "1 spans… no spans" #148, top bar #046, no time column (now Time); re-scored 2026-10-28 in light, true dark and 360 | P02, P04 |
| Errors | `#/errors` | 8 → 9 | 7 → 8 · 360: 6 → 8 | at 360 the two charts come before the exceptions list; was: details out of view #147, menus filled the first screen (now one Filters button #119), top bar #046; re-scored 2026-10-28 in light, true dark and 360 | P02, P04 |
| Logs | `#/logs` | 8 | 8 | at 360 the Request column is cut at the right edge; rows are tall with wide gaps; was: Django 4xx lines Outside a request #181, faint service chips in dark #193 | P06 |
| Database | `#/database` | 8 | 8 | query text cut at 1440 with no wrap toggle; at 360 the filters fill the first screen; was: top bar #046 | P02 |
| Rendering | `#/rendering` | 8 | 8 | the device table leaves out views with no known device and does not say how many (old views only); "Hydration –" on a static site; was: no split by device #087, 1160 px wide #088, views from the CDN script missing from the split #113 | P04 |
| Metrics | `#/metrics` | 7 | 7 | at 360 35 metric names wrap at every dot (system. / disk. / operatio / ns) in a narrow column; a metric opens only from the list, no chart until picked; was: no Go metrics #185, line names spilled #179 | P06 |
| Services | `#/services` | 8 → 9 | 7 → 8 | two tables name the same services (health, then who sends); was: `localhost:3001` unexplained #144, a sideways swipe at 360 #152, map numbers on top of each other #076, a call behind a box #077, top bar #046; re-scored 2026-10-28 in light, true dark and 360 | P02, P03 |
| Hosts | `#/hosts` | 8 | 8 | at 360 the host name wraps to four lines (lmd- / vm- / ubuntu- / 03) and the table cuts Disk and later; was: row click did nothing #187 | P06 |
| Kubernetes | `#/kubernetes` | 8 | 8 | on sparx's 3-node AKS: the Pods card counts 132 while the table pages 185 (it keeps Gone pods); was: nodes 0 of 3 ready and most pods Unknown #202, bars broken #204, the host recipe #188, link by color only #192 | P06 |
| Insights | `#/insights` | 8 | 8 | at 360 the table cuts each insight's text at the right edge | P06 |
| Security | `#/security` | 8 | 8 | at 360 the OWASP grid is ten cards before the two risks; the risk table cuts at the right; was: from 1 services #180 | P06 |
| Users | `#/users` | 8 | 8 | empty here (Django sends no enduser.id), and says which attribute fills it | P06 |
| Alerts | `#/alerts` | 8 | 7 → 8 | at 360 the actions take a third of the row and long rule names wrap to four lines; was: five controls on every row #145, Rule column one letter wide #047, names one word per line #116, top bar #046; re-scored 2026-10-28 in light, true dark and 360 | P02, P04 |
| Uptime | `#/uptime` | 8 | 8 | "Average of the checks that are on" is cut at 1440; at 360 the checks table starts below four cards; P04: was: outage times in UTC #102, and #099–#101 | P02, P04 |
| SLOs | `#/slos` | 7 → 8 | 8 | Apdex targets share the page with SLOs as a second idea with no heading link between them; was: Goal column one letter wide at 360 #047 | P02 |
| Dashboards | `#/dashboards` | 8 | 8 | list has one dashboard; Shared badge has no word of who it is shared with at 360 | P06 |
| Connect | `#/connect` | 8 | 8 | setup steps are long at 360 (four copy boxes); was: links by color only #192 | P06 |
| People & access | `#/people` | 8 | 8 | at 360 the tab row scrolls and hides Single sign-on and later tabs past the edge; member emails wrap in three lines | P06 |
| Organization | `#/organization` | 8 | 8 | at 360 four row buttons stack tall (Rename, Access, Clear data, Delete); was: buttons off-screen #197 | P06 |
| Connect › setup | `#/connect/setup` | 8 | 8 | env lines are small mono at 360 and wrap mid-value; copy buttons sit far right of the value; P04 at 360: the tab row cuts "Sending keys" with no sign that it scrolls; was: no static-site path #080, Copy over the code #081, no ready script tag #083 | P02, P04 |
| Connect › server | `#/connect/server` | 8 | 8 | the redacted-keys list is a cloud of chips with no grouping; was: green badge faint #193 | P06 |
| Connect › Sending keys | `#/connect/keys` | 8 · 360: 7 → 8 | 8 → 9 | at 360 the tab row scrolls ("Server setup" cut at the left); was: rotate rows with one name #140, a rotate stretched the end date #141, Projects cut at 360 #140, revoke said nothing about use #042, revoked key nobody told #111, buttons under 44 px #114; re-scored 2026-10-28 in light, true dark and 360 | P02, P04 |
| Connect › AI read keys | `#/connect/read-keys` | 8 | 8 | empty, says what a read key is for and links Connected apps | P06 |
| Organization › Projects | `#/organization/projects` | 8 | 8 | at 360 Rename, Access, Clear data and Delete sit off to the right inside the table scroll | P02 |
| Organization › Data retention | `#/organization/retention` | 8 | 8 | the hint under Days is small muted text; was: shortening asked nothing and showed old days #044, logs vs traces rule unclear #045 | P02 |
| Organization › Thresholds and hidden keys | `#/organization/checks` | 8 | 8 | hints under the two numbers are small muted text | P02 |
| Organization › Tags | `#/organization/tags` | 8 | 8 | at 360 built-in tags' switches sit at the edge with their label cut; was: said nothing of one project #173, switches all named On #171 | P06 |
| Organization › Billing | `#/organization/billing` | 8 | 8 | with one day of data the chart is one lone bar and the usage bar looks empty; at 360 the section tabs cut "Billing" at the edge; was: GB showed 0.00 #132, cap note lost #133, failed payment silent #134, plan switch errors and no loss list #136 | P05 |
| Organization › General | `#/organization/general` | 8 | 8 | "Delete this organization" sits right under the name box (the typed name and password guard it) | P02 |
| People & access › Members | `#/people/members` | 8 | 8 | at 360 "Member since" moves into the table scroll | P02 |
| People & access › Project access | `#/people/access` | 8 | 8 | at 360 Own roles is under the sticky button until you swipe; was: Change access off-screen #197 | P06 |
| People & access › Single sign-on | `#/people/sso` | 8 | 8 | the 5-minute sign-out promise is in body text only, no status per person; was: a removed person came back by SSO #135 | P05 |
| People & access › User sync (SCIM) | `#/people/scim` | 8 | 8 | Free org: says it needs Business and links the upgrade; the real flow was proved on P05's org #175 | P06 |
| People & access › Connected apps | `#/people/apps` | 8 | 8 | at 360 Can read and Connected scroll under the Disconnect button; was: wrong menu path #176 | P06 |
| People & access › Shared links | `#/people/links` | 8 | 8 | at 360 the link column shows GET /report and the id in three lines; was: links could not be told apart #178 | P06 |
| People & access › Audit log | `#/people/audit` | 7 → 8 | 8 | at 360 What and Detail move into the table scroll; 29 Tab stops to reach it; was: revoked key unnamed #048, cancelled invite unnamed #040, no "how long ago" #041, export named no one #137, viewers shut out #138 | P02, P05 |
| Account › Profile | `#/account/profile` | 8 | 9 | one name box and the email; Change for email is small link text | P06 |
| Account › Devices | `#/account/devices` | 8 | 8 | one row here; at 360 Device wraps Chrome / on / Windows; was: hidden until a fresh sign-in #190 | P06 |
| Account › Preferences | `#/account/preferences` | 8 | 9 | says choices are saved in this browser only | P06 |
| Account › Emails | `#/account/emails` | 7 | 8 | at 360 the per-project table squeezes names to one word a line and repeats the org under each; was: we sent on a cloud with no mail #168 | P06 |
| Account › Delete account | `#/account/delete` | 8 | 8 | says why delete is blocked (only owner) and what to do first | P06 |
| Account › Security | `#/account/security` | 8 | 8 | "Turn off" two-step is a solid red button beside "New backup codes" | P02 |
| Connect › options | `#/connect/options` | 8 | 8 | 20 options in pages of 15 at 360; Node names are on page 2 only by scrolling sideways | P06 |
| Trace › Timeline | `#/traces/<id>` | 8 | 7 → 8 | at 360 the tabs scroll; was: a browser-only trace read "Network and other 4.84 s" #142, "HTTP CALLS 0" above "HTTP 1" #153, the browser chip #078, 714 px wide on a phone #092; re-scored 2026-10-28 in light, true dark and 360 | P02, P03, P04 |
| Trace › SQL | `#/traces/<id>/sql` | 8 | 8 | an UPDATE's params run three lines of small mono with no wrap toggle; at 360 the facts fill the first screen before the queries; was: SecurityStamp shown #068, accents escaped #072 | P03 |
| Trace › HTTP | `#/traces/<id>/http` | 8 | 8 | at 360 the HTTP tab starts below six finding cards; was: heading skipped a level #195, pill faint #193 | P06 |
| Trace › Messages | `#/traces/<id>/messages` | 8 | 8 | empty for Django (no queue), says none were sent or handled | P06 |
| Trace › Logs | `#/traces/<id>/logs` | 8 | 8 | at 360 the Category column is cut at the right edge | P06 |
| Trace › Errors | `#/traces/<id>/errors` | 8 | 8 | the stack trace's long temp paths wrap mid-word; was: stack box not keyboard reachable #194 | P06 |
| Trace compare | `#/traces/<a>/compare/<b>` | 7 | 8 | at 360 the timeline axis labels overlap (0 ms90 ms179 ms); Numbers table fills the first screen; was: amber SQL labels faint #193 | P06 |
| Error group | `#/errors/<group>` | 8 | 7 → 8 | at 360 three rows of buttons come before the numbers; was: Next.js's own telemetry call counted as an error #143, buttons ran off the screen #049; re-scored 2026-10-28 in light, true dark and 360 | P02 |
| Service endpoint | `#/services/<svc>/endpoints/<ep>` | 8 | 8 | at 360 query text and the Calls table cut at the right edge | P06 |
| Query shape | `#/database/queries/<sql>` | 8 | 8 | at 360 the SQL wraps to 7 lines before the numbers; the copy button is under the text, not beside it | P02 |
| Page route | `#/rendering/routes/<route>` | 8 | 8 | at 360 the route title in monospace breaks mid-word; was: no device and no reason #090, "Total 1.56 s" for a 6.14 s load #091 | P04 |
| User | `#/users/<user>` | 8 | 8 | at 360 Slowest and Newest Requests cut the request path at the right edge; Status and Duration scroll off; was: Tag this cut at the edge #200 | P06 |
| Service | `#/services/<svc>` | 8 | 8 → 9 | at 360 the facts (kind, hosts, version…) fill the first screen before a number; the not-sending band shares the Errors pink; was: a send gap drew as 0 requests #043 | P02 |
| Problem | `#/problems/<id>` | — | — | — | — |
| Alert rule | `#/alerts/<id>` | 8 | 8 | the line starts on the day the rule was made, so most of the 7-day chart is blank with no word on why; was: link said traces and opened queries #036, lost after two-step sign-in #035 | P02 |
| SLO | `#/slos/<id>` | 8 | 6 → 8 | the budget chart is a flat line at 0 once spent; a 2-minute outage is a 3 px band on a 30-day chart, so the list carries it; was: an outage spent no budget and nothing showed it (#038) | P02 |
| Dashboard | `#/dashboards/<id>` | 7 | 8 | at 360 the legend lists three attributes per line (method, status, path) so 7 lines fill the card; was: names spilled over the menu #179 | P06 |
| Shared page (signed out) | `#/shared/<token>` | 8 | 8 | at 360 "link works until Nov 3, 2026" wraps under the logo and the tabs scroll sideways; was: stayed light in dark mode #075; P04: was: titled "WizeLens" #106, links that led to sign-in #107 | P03, P04 |
| Status page | `#/status/<slug>` | 8 | 9 | at 360 "Uptime by" sits in two lines beside the title; day bars have no date until hover, and a phone has no hover; was: link only from the check #182, bar colors #183 | P06 |
| Uptime check | `#/uptime/<id>` | 8 | 8 | on day one the 30-day card reads the same as 24 h and does not say how much is measured; was: counted from before the first run #037 | P02 |
| Host | `#/hosts/<name>` | 8 | 8 | at 360 File Systems' size wraps to four lines (62.3 / MB of / 126 / MB); was: disk card mixed two disks #186 | P06 |
| Kubernetes node | `#/kubernetes/node/<name>` | 8 | 8 | Pods card 94 while the table says 139 (Gone pods); every row repeats this node's name; CPU axis mixes "1.00 cores" and "0 millicores"; at 360 the pod table cuts at CPU and hides Memory; empty cells mix – and — | P06 |
| Kubernetes pod | `#/kubernetes/pod/<ns>/<name>` | 8 | 8 | CPU chart scales to 1 core, so a 2-millicore pod is a flat line on the floor; no link to this pod's logs or traces; at 360 Containers and Services side-scroll | P06 |

P06 scored the rest of this group in four views (User on P03's cloud org, which has eShop's signed-in users). Not scored: Problem detail (no org had a problem to open; Problems was still learning), Kubernetes node and pod at first (no cluster); scored 2026-10-29 on sparx's production AKS once the WizeLens collector went on it (sparx #145).

### Cloud · account screens — 12 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Sign in | `(signed out)` | 8 | 8 | the card is small and alone on a wide empty page at 1440; Forgot password and Create an account are small link text side by side; was: Start free opened sign-in #160, dark buttons faint #161 | P06 |
| Create account | `(signed out)` | 8 | 8 | the card says nothing about what the account is for; "I have an account" is small link text; was: stayed light in dark mode #075 | P03 |
| No organization yet | `(signed out)` | — | — | — | — |
| setup | `#/setup` | — | — | — | — |
| two-factor | `#/two-factor` | 8 | 8 | the two links under Continue (backup code, back to sign in) are small text side by side; at 1440 the card is small on a wide empty page | P06 |
| forgot-password | `#/forgot-password` | 8 | 9 | Back to sign in is small link text; was: said a link was on its way on a cloud with no mail #163 | P06 |
| reset-password | `#/reset-password` | 8 | 8 | Send a new link is a grey outline button, not the main blue one, and the card has no way back to sign in; was: engineer words #164 | P06 |
| verify-email | `#/verify-email` | 8 | 8 | the heading says the link does not work and the line below says not complete: two names for one problem | P06 |
| invite | `#/invite` | 8 | 8 | a broken invite says ask your team, but not who sent it or which org | P06 |
| delete-account | `#/delete-account` | 8 | 8 | signed out it is the sign-in card with one grey line on top; the line that says why is easy to miss | P06 |
| oauth | `#/oauth` | 8 | 8 | the expired screen has no button: it says go back to the app, with no link to WizeLens; the real consent was used in Act 6 (#176) | P06 |
| oauth-consent | `#/oauth-consent` | 8 | 8 | same expired card as oauth, no button and no way on | P06 |

Sign in, two-factor and invite were opened by P02 (acts 1, 7 and 9) in light at 1440 only, so they are not scored (RULE #6). P03 scored Create account in all three views. P06 scored the rest in four views. Not scored: setup shows only on a new cloud with no users (this one has users, so it opens Sign in); No organization yet did not show, because a new account gets a starter project.

### HUD (in the app's own page) — 2 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| HUD card | `bottom corner of the app` | 8 | 7 → 8 | on a light page the card is dark and its panels light; Next.js' dev "N" button covers the SQL count bottom left; was: covered the last card #011; on eShop at 360 the card fits and shows no route name; P04 (static site, 360): Server and Database read "—" with nothing to explain why; was: on for every visitor of her site #103 (now `?wizelens-hud=on`) | P01, P03, P04 |
| HUD details panel | `HUD › details` | 6 → 8 | 8 | on a phone the full call name is only in a hover title, which touch cannot open; was: method cut and axis labels overlapped at 360 #023; was: "Calls · 0" above the page row #079 | P01, P03 |

### Site · wizelens.com — 19 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Home | `/` | 8 | 8 | light only (site has no dark theme); hero demo shows only the logo for ~3 s before it plays; 12px grey footnote under the buttons is hard to read | P01 |
| angular | `/angular` | 8 | 8 | light only (site has no dark theme); stat notes under 2 providers / Angular 14+ are 12px grey; at 360 the code demo starts below the second screen | P06 |
| changelog | `/changelog` | 8 | 8 | light only; 20 version chips before any content at 360px | P01 |
| cloud | `/cloud` | 8 | 7 | the longest site page: 16,000 px at 360; the Team demo's text is 11-12px; light only; was: role names ran together at 360 #158 | P06 |
| dotnet | `/dotnet` | 8 | 8 | the Program.cs code box is empty for the first seconds; the package version is not on the page (NuGet picks it); light only (no dark theme on the site); was: "Requires .NET 10 or newer" #051 | P03 |
| go | `/go` | 8 | 8 | light only; stat notes 12px grey; Requires Go 1.26 sits at the end of a dense paragraph | P06 |
| java | `/java` | 8 | 8 | light only; stat notes 12px grey; the extension's Java 17 floor is only in the paragraph | P06 |
| license | `/license` | 8 | 8 | light only; at 360 the package table is a long block of mono names before the plain words; the page's own tab row wraps to two lines | P06 |
| node | `/node` | 8 | 8 | light only; stat notes 12px grey; the frameworks list is long at 360 (about 9,000 px) | P06 |
| pricing | `/pricing` | 8 | 9 | light only; 120 GB slider's tick labels are 11px; was: plans that do not fit faded past reading, cost bars unlabeled #157 | P06 |
| privacy | `/privacy` | 8 | 8 | light only; at 360 the On this page list is gone, so a 7,000 px page has no jump links | P06 |
| python | `/python` | 8 | 8 | light only; stat notes 12px grey; the PyPI wait (install from GitHub) is said twice in the hero | P06 |
| react | `/react` | 8 | 6 → 8 | light only; was: Set it up opened React docs for a Next.js dev #001 | P01 |
| security | `/security` | 8 | 8 | light only; at 360 no On this page list for a 6,000 px page; security@wizelens.com is a link in the text, easy to find | P06 |
| story | `/story` | 7 | 8 | at 1440 the first screen is a headline over empty space while the demo loads; at 360 the Then demo box shows three tiny chips and no words; light only | P06 |
| svelte | `/svelte` | 8 | 8 | light only; stat notes 12px grey; Plain Svelte (svelte-spa-router) is easy to miss | P06 |
| terms | `/terms` | 8 | 8 | light only; at 360 no On this page list for a 5,400 px page | P06 |
| vue | `/vue` | 8 | 8 | light only; stat notes 12px grey | P06 |
| Docs home | `/docs` | 8 | 8 | light only; Three ways to run it table squeezes to narrow columns at 360; was: menus both named Docs #159 | P06 |

### Site · docs — 35 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| ai-access | `/docs/ai-access` | 8 | 8 | 12,600 px at 360; light only; the MCP JSON box scrolls sideways at 360 | P06 |
| alerts | `/docs/alerts` | 8 | 8 | light only; the rule table is long before What a rule can watch | P06 |
| aspnet-core | `/docs/aspnet-core` | 8 | 8 | light only; Databases table's install commands wrap in pieces at 360; was: columns crushed #196 | P06 |
| auto-install | `/docs/auto-install` | 8 | 7 | dense: three ways in one page with a version caveat paragraph per runtime; light only | P06 |
| browser | `/docs/browser` | 8 | 8 | light only; four frameworks on one page make it 10,000 px at 360 | P06 |
| cloud | `/docs/cloud` | 8 | 7 | 24,000 px at 360, the longest docs page: running it, teams, billing and SSO in one; light only | P06 |
| configuration | `/docs/configuration` | 8 | 7 | 23,000 px at 360: one long table per add-on with no jump list on a phone; light only; was: option names broke every 2 letters #196 | P06 |
| dashboard | `/docs/dashboard` | 8 | 8 | light only; the page-by-page table is long (15,000 px at 360) | P06 |
| dashboards | `/docs/dashboards` | 8 | 8 | light only | P06 |
| errors | `/docs/errors` | 8 | 8 | light only; the Filters table repeats what the page shows | P06 |
| go | `/docs/go` | 8 | 8 | light only; Start options table code wraps at 360; was: no metrics from Go #185 | P06 |
| hub | `/docs/hub` | 8 | 8 | light only; the Options table (flag, variable, default) scrolls sideways at 360 | P06 |
| hud | `/docs/hud` | 8 | 8 | light only | P06 |
| insights | `/docs/insights` | 8 | 8 | light only | P06 |
| java | `/docs/java` | 8 | 8 | light only; the extension table is code-heavy at 360 | P06 |
| kubernetes | `/docs/kubernetes` | 8 | 8 | light only; the Helm values table is long with code names that wrap at 360 | P06 |
| logs | `/docs/logs` | 8 | 8 | light only; the 5-column options table scrolls sideways at 360 | P06 |
| nextjs | `/docs/nextjs` | 8 | 8 | light only; no section for upgrading an app that already has WizeLens (only one line: delete .next) | P01 |
| node | `/docs/node` | 8 | 8 | light only; 11,800 px at 360 | P06 |
| problems | `/docs/problems` | 8 | 8 | light only | P06 |
| production | `/docs/production` | 8 | 8 | light only | P06 |
| python | `/docs/python` | 8 | 8 | light only; was: the start command stopped a Django app #167 | P06 |
| quick-start | `/docs/quick-start` | 8 | 8 | light only; many links (66) on one short page | P06 |
| react | `/docs/react` | 8 | 8 | light only | P06 |
| releases | `/docs/releases` | 8 | 8 | light only | P06 |
| sampling | `/docs/sampling` | 8 | 8 | light only | P06 |
| search | `/docs/search` | 8 | 8 | light only; the query-language table is code-heavy at 360 | P06 |
| security | `/docs/security` | 8 | 8 | light only; 8,300 px at 360 | P06 |
| several-services | `/docs/several-services` | 8 | 8 | light only | P06 |
| slos | `/docs/slos` | 8 | 8 | light only | P06 |
| source-maps | `/docs/source-maps` | 8 | 8 | light only | P06 |
| tags | `/docs/tags` | 8 | 8 | light only | P06 |
| troubleshooting | `/docs/troubleshooting` | 8 | 8 | light only; answers are paragraphs, not steps | P06 |
| uptime | `/docs/uptime` | 8 | 8 | light only | P06 |
| users | `/docs/users` | 8 | 8 | light only | P06 |

---

## How this list was built

`node docs/personas/gen-screens.mjs .` from the repo root. It reads the menu (`js/packages/ui/src/shell/nav.ts`, with each item's `needs` capability against the in-app set), the section lists of Connect, Settings / Organization, People & access and Account, the detail-route helpers in `js/packages/ui/src/routes.ts` and its `AUTH_PAGES`, the site's `site/src/app` folders, and the docs in `site/content/docs`. A section whose label is computed (Connect › setup, server, options) is listed by its id.

Regenerate it the same way after any change that adds or removes a screen, and diff the result. A denominator that silently stops counting is worse than none.
