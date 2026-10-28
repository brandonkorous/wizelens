# WizeLens — screen ratings

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-28

Every screen in WizeLens, scored on **Design** and **Ease** as the personas open
them. How and when to score is RULE #6 in [CLAUDE.md](CLAUDE.md); this file is
where the numbers live.

**Scored so far: 54 of 177 screens.** (2026-10-28: the runner's "dark" set only the browser's scheme while the dashboard keeps its own saved theme, so dark checks before 09:30 that day may have been light; every screen re-scored that day was checked again in true dark.) Update that line as rows fill in —
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
- **Hosts and Kubernetes with real infra data.** Both need the infra collector on a cluster; nothing in this run sends it. The rows exist on the cloud list and stay `—`.
- **Python, Java and Go add-ons.** No persona runs them. (.NET is P03's: eShopOnWeb on .NET 8, from 2026-10-27; its
  dashboard is the same screens as the in-app list, re-scored under "in-app on .NET" and not counted twice.)

They are not listed below and are not scored. **If a persona ever reaches one, that
is a `major` issue, not a rating.**

---


### Dashboard · in-app (/_wizelens) — 39 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Overview | `#/` | 8 | 7 → 9 | the subtitle takes two lines at 360 before the cards; was: "No data for previous day" on every card #139, cards pushed the first chart to 757 px at 360 #149, time axis overlapped at 360 #022; re-scored 2026-10-28 in light, true dark and 360 (cloud build, same screen) | P01 |
| Problems | `#/problems` | — | — | — | — |
| Search | `#/search` | 8 | 7 → 9 | a bare word does not look inside SQL params (`@wizelens.db.parameters:*x*` does); was: ran only on Enter #146, tabs and time axis overflowed at 360 #021 #022; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Requests | `#/requests` | 8 | 8 | Path cuts the end of long ids at 1440, so /clans and /members look alike; at 360 the filters fill the first screen | P01 |
| Traces | `#/traces` | 7 → 8 | 7 → 8 | at 360 four cards come before the list (it starts at 568 px, inside the first screen); was: list a third of the width #148, uptime runs filled the list #151, search waited for Enter #014, 9-line paths #016, cross-origin traces read long #015, pager overflowed #017; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Errors | `#/errors` | 8 → 9 | 7 → 8 | dev-restart ENOENT noise counts with app errors; Resolve lives on the hub/cloud #012; was: details out of view and "not in the selected time range" while loading #147; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Logs | `#/logs` | 7 → 8 | 7 → 8 | at 360 the lines start at 717 px, after cards, filters and the save line; was: "Errors 173" beside 65 exceptions (now "Error Lines"), unfiltered patterns #020; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Database | `#/database` | 8 | 8 | query text cut at 1440 with no wrap toggle; at 360 the filters fill the first screen | P01 |
| Rendering | `#/rendering` | — | — | — | — |
| Metrics | `#/metrics` | — | — | — | — |
| Services | `#/services` | — | — | — | — |
| Insights | `#/insights` | 8 | 8 | Endpoints column cuts the route (/api/v1/boards/:boardId/cards/:c…); was: N+1 count read as exact #010 | P01 |
| Security | `#/security` | — | — | — | — |
| Users | `#/users` | — | — | — | — |
| Connect | `#/connect` | 7 → 8 | 7 → 8 | settings change in code and need a restart, by design; .NET option names not seen on screen; was: rows named no option #150, Off with no way on #018, wider than a phone #021; re-scored 2026-10-28 on an in-app dashboard at 1440 and 360 (dark not seen) | P01 |
| Settings | `#/settings` | — | — | — | — |
| Connect › setup | `#/connect/setup` | — | — | — | — |
| Connect › server | `#/connect/server` | — | — | — | — |
| Connect › Sending keys | `#/connect/keys` | — | — | — | — |
| Connect › AI read keys | `#/connect/read-keys` | — | — | — | — |
| Settings › Data retention | `#/settings/retention` | — | — | — | — |
| Settings › Thresholds and hidden keys | `#/settings/checks` | — | — | — | — |
| Settings › Tags | `#/settings/tags` | — | — | — | — |
| Settings › Preferences | `#/settings/preferences` | — | — | — | — |
| Connect › options | `#/connect/options` | — | — | — | — |
| Trace › Timeline | `#/traces/<id>` | 8 | 8 | span bars under 1 ms are slivers; was: header actions overflowed at 360 #021 | P01 |
| Trace › SQL | `#/traces/<id>/sql` | 8 | 8 | long SELECT lists wrap to 3 lines with no collapse; params shown redacted as [redacted] with no column name | P01 |
| Trace › HTTP | `#/traces/<id>/http` | — | — | — | — |
| Trace › Messages | `#/traces/<id>/messages` | — | — | — | — |
| Trace › Logs | `#/traces/<id>/logs` | 8 | 7 → 8 | Service chip wraps to 2 lines in light at 1440; was: empty tab did not say Fastify's lines are left out #020 | P01 |
| Trace › Errors | `#/traces/<id>/errors` | — | — | — | — |
| Trace compare | `#/traces/<a>/compare/<b>` | 7 → 8 | 7 → 8 | at 360 the Numbers table fills the first screen before the two sides; was: Total said nothing of render (now "Total (call + render)"), "HTTP calls" beside an HTTP tab of 1 #153, "Same request" read 48 ms #015, waterfall overflowed #021; re-scored 2026-10-28 in light, true dark and 360 | P01 |
| Error group | `#/errors/<group>` | 8 | 8 | "Chrome on Wind…" cut at 360 with the full name only on hover; was: Browsers always empty for a browser error #013 | P01 |
| Service endpoint | `#/services/<svc>/endpoints/<ep>` | — | — | — | — |
| Query shape | `#/database/queries/<sql>` | — | — | — | — |
| Page route | `#/rendering/routes/<route>` | — | — | — | — |
| User | `#/users/<user>` | — | — | — | — |
| Service | `#/services/<svc>` | — | — | — | — |
| Problem | `#/problems/<id>` | — | — | — | — |

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
| Problems | `#/problems` | — | — | — | — |
| Search | `#/search` | 8 | 7 → 8 | a bare word does not look inside SQL params (`@wizelens.db.parameters:*Peña*` does); P04: on a static site "Requests (0)" is the first tab while Traces holds her 117; was: ran only on Enter #146, top bar #046; re-scored 2026-10-28 in light, true dark and 360 | P02, P03, P04 |
| Requests | `#/requests` | 8 | 8 · 360: 6 | at 360 the filters fill the first screen; Path cuts long ids at 1440; was: top bar #046; P04 at 360: six filters fill the first screen; on a static site its only rows are two script reads stored before #093 | P02, P04 |
| Traces | `#/traces` | 7 → 8 | 7 → 8 | at 360 four cards come before the list; was: list a third of the width #148, uptime runs filled the first page #151, empty preview said "1 spans… no spans" #148, top bar #046, no time column (now Time); re-scored 2026-10-28 in light, true dark and 360 | P02, P04 |
| Errors | `#/errors` | 8 → 9 | 7 → 8 · 360: 6 → 8 | at 360 the two charts come before the exceptions list; was: details out of view #147, menus filled the first screen (now one Filters button #119), top bar #046; re-scored 2026-10-28 in light, true dark and 360 | P02, P04 |
| Logs | `#/logs` | — | — | — | — |
| Database | `#/database` | 8 | 8 | query text cut at 1440 with no wrap toggle; at 360 the filters fill the first screen; was: top bar #046 | P02 |
| Rendering | `#/rendering` | 8 | 8 | the device table leaves out views with no known device and does not say how many (old views only); "Hydration –" on a static site; was: no split by device #087, 1160 px wide #088, views from the CDN script missing from the split #113 | P04 |
| Metrics | `#/metrics` | — | — | — | — |
| Services | `#/services` | 8 → 9 | 7 → 8 | two tables name the same services (health, then who sends); was: `localhost:3001` unexplained #144, a sideways swipe at 360 #152, map numbers on top of each other #076, a call behind a box #077, top bar #046; re-scored 2026-10-28 in light, true dark and 360 | P02, P03 |
| Hosts | `#/hosts` | — | — | — | — |
| Kubernetes | `#/kubernetes` | — | — | — | — |
| Insights | `#/insights` | — | — | — | — |
| Security | `#/security` | — | — | — | — |
| Users | `#/users` | — | — | — | — |
| Alerts | `#/alerts` | 8 | 7 → 8 | at 360 the actions take a third of the row and long rule names wrap to four lines; was: five controls on every row #145, Rule column one letter wide #047, names one word per line #116, top bar #046; re-scored 2026-10-28 in light, true dark and 360 | P02, P04 |
| Uptime | `#/uptime` | 8 | 8 | "Average of the checks that are on" is cut at 1440; at 360 the checks table starts below four cards; P04: was: outage times in UTC #102, and #099–#101 | P02, P04 |
| SLOs | `#/slos` | 7 → 8 | 8 | Apdex targets share the page with SLOs as a second idea with no heading link between them; was: Goal column one letter wide at 360 #047 | P02 |
| Dashboards | `#/dashboards` | — | — | — | — |
| Connect | `#/connect` | — | — | — | — |
| People & access | `#/people` | — | — | — | — |
| Organization | `#/organization` | — | — | — | — |
| Connect › setup | `#/connect/setup` | 8 | 8 | env lines are small mono at 360 and wrap mid-value; copy buttons sit far right of the value; P04 at 360: the tab row cuts "Sending keys" with no sign that it scrolls; was: no static-site path #080, Copy over the code #081, no ready script tag #083 | P02, P04 |
| Connect › server | `#/connect/server` | — | — | — | — |
| Connect › Sending keys | `#/connect/keys` | 8 · 360: 7 → 8 | 8 → 9 | at 360 the tab row scrolls ("Server setup" cut at the left); was: rotate rows with one name #140, a rotate stretched the end date #141, Projects cut at 360 #140, revoke said nothing about use #042, revoked key nobody told #111, buttons under 44 px #114; re-scored 2026-10-28 in light, true dark and 360 | P02, P04 |
| Connect › AI read keys | `#/connect/read-keys` | — | — | — | — |
| Organization › Projects | `#/organization/projects` | 8 | 8 | at 360 Rename, Access, Clear data and Delete sit off to the right inside the table scroll | P02 |
| Organization › Data retention | `#/organization/retention` | 8 | 8 | the hint under Days is small muted text; was: shortening asked nothing and showed old days #044, logs vs traces rule unclear #045 | P02 |
| Organization › Thresholds and hidden keys | `#/organization/checks` | 8 | 8 | hints under the two numbers are small muted text | P02 |
| Organization › Tags | `#/organization/tags` | — | — | — | — |
| Organization › Billing | `#/organization/billing` | 8 | 8 | with one day of data the chart is one lone bar and the usage bar looks empty; at 360 the section tabs cut "Billing" at the edge; was: GB showed 0.00 #132, cap note lost #133, failed payment silent #134, plan switch errors and no loss list #136 | P05 |
| Organization › General | `#/organization/general` | 8 | 8 | "Delete this organization" sits right under the name box (the typed name and password guard it) | P02 |
| People & access › Members | `#/people/members` | 8 | 8 | at 360 "Member since" moves into the table scroll | P02 |
| People & access › Project access | `#/people/access` | — | — | — | — |
| People & access › Single sign-on | `#/people/sso` | 8 | 8 | the 5-minute sign-out promise is in body text only, no status per person; was: a removed person came back by SSO #135 | P05 |
| People & access › User sync (SCIM) | `#/people/scim` | — | — | — | — |
| People & access › Connected apps | `#/people/apps` | — | — | — | — |
| People & access › Shared links | `#/people/links` | — | — | — | — |
| People & access › Audit log | `#/people/audit` | 7 → 8 | 8 | at 360 What and Detail move into the table scroll; 29 Tab stops to reach it; was: revoked key unnamed #048, cancelled invite unnamed #040, no "how long ago" #041, export named no one #137, viewers shut out #138 | P02, P05 |
| Account › Profile | `#/account/profile` | — | — | — | — |
| Account › Devices | `#/account/devices` | — | — | — | — |
| Account › Preferences | `#/account/preferences` | — | — | — | — |
| Account › Emails | `#/account/emails` | — | — | — | — |
| Account › Delete account | `#/account/delete` | — | — | — | — |
| Account › Security | `#/account/security` | 8 | 8 | "Turn off" two-step is a solid red button beside "New backup codes" | P02 |
| Connect › options | `#/connect/options` | — | — | — | — |
| Trace › Timeline | `#/traces/<id>` | 8 | 7 → 8 | at 360 the tabs scroll; was: a browser-only trace read "Network and other 4.84 s" #142, "HTTP CALLS 0" above "HTTP 1" #153, the browser chip #078, 714 px wide on a phone #092; re-scored 2026-10-28 in light, true dark and 360 | P02, P03, P04 |
| Trace › SQL | `#/traces/<id>/sql` | 8 | 8 | an UPDATE's params run three lines of small mono with no wrap toggle; at 360 the facts fill the first screen before the queries; was: SecurityStamp shown #068, accents escaped #072 | P03 |
| Trace › HTTP | `#/traces/<id>/http` | — | — | — | — |
| Trace › Messages | `#/traces/<id>/messages` | — | — | — | — |
| Trace › Logs | `#/traces/<id>/logs` | — | — | — | — |
| Trace › Errors | `#/traces/<id>/errors` | — | — | — | — |
| Trace compare | `#/traces/<a>/compare/<b>` | — | — | — | — |
| Error group | `#/errors/<group>` | 8 | 7 → 8 | at 360 three rows of buttons come before the numbers; was: Next.js's own telemetry call counted as an error #143, buttons ran off the screen #049; re-scored 2026-10-28 in light, true dark and 360 | P02 |
| Service endpoint | `#/services/<svc>/endpoints/<ep>` | — | — | — | — |
| Query shape | `#/database/queries/<sql>` | 8 | 8 | at 360 the SQL wraps to 7 lines before the numbers; the copy button is under the text, not beside it | P02 |
| Page route | `#/rendering/routes/<route>` | 8 | 8 | at 360 the route title in monospace breaks mid-word; was: no device and no reason #090, "Total 1.56 s" for a 6.14 s load #091 | P04 |
| User | `#/users/<user>` | — | — | — | — |
| Service | `#/services/<svc>` | 8 | 8 → 9 | at 360 the facts (kind, hosts, version…) fill the first screen before a number; the not-sending band shares the Errors pink; was: a send gap drew as 0 requests #043 | P02 |
| Problem | `#/problems/<id>` | — | — | — | — |
| Alert rule | `#/alerts/<id>` | 8 | 8 | the line starts on the day the rule was made, so most of the 7-day chart is blank with no word on why; was: link said traces and opened queries #036, lost after two-step sign-in #035 | P02 |
| SLO | `#/slos/<id>` | 8 | 6 → 8 | the budget chart is a flat line at 0 once spent; a 2-minute outage is a 3 px band on a 30-day chart, so the list carries it; was: an outage spent no budget and nothing showed it (#038) | P02 |
| Dashboard | `#/dashboards/<id>` | — | — | — | — |
| Shared page (signed out) | `#/shared/<token>` | 8 | 8 | at 360 "link works until Nov 3, 2026" wraps under the logo and the tabs scroll sideways; was: stayed light in dark mode #075; P04: was: titled "WizeLens" #106, links that led to sign-in #107 | P03, P04 |
| Status page | `#/status/<slug>` | — | — | — | — |
| Uptime check | `#/uptime/<id>` | 8 | 8 | on day one the 30-day card reads the same as 24 h and does not say how much is measured; was: counted from before the first run #037 | P02 |
| Host | `#/hosts/<name>` | — | — | — | — |
| Kubernetes node | `#/kubernetes/node/<name>` | — | — | — | — |
| Kubernetes pod | `#/kubernetes/pod/<ns>/<name>` | — | — | — | — |

### Cloud · account screens — 12 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Sign in | `(signed out)` | — | — | — | — |
| Create account | `(signed out)` | 8 | 8 | the card says nothing about what the account is for; "I have an account" is small link text; was: stayed light in dark mode #075 | P03 |
| No organization yet | `(signed out)` | — | — | — | — |
| setup | `#/setup` | — | — | — | — |
| two-factor | `#/two-factor` | — | — | — | — |
| forgot-password | `#/forgot-password` | — | — | — | — |
| reset-password | `#/reset-password` | — | — | — | — |
| verify-email | `#/verify-email` | — | — | — | — |
| invite | `#/invite` | — | — | — | — |
| delete-account | `#/delete-account` | — | — | — | — |
| oauth | `#/oauth` | — | — | — | — |
| oauth-consent | `#/oauth-consent` | — | — | — | — |

Sign in, two-factor and invite were opened by P02 (acts 1, 7 and 9) in light at 1440 only, so they are not scored (RULE #6). P03 scored Create account in all three views.

### HUD (in the app's own page) — 2 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| HUD card | `bottom corner of the app` | 8 | 7 → 8 | on a light page the card is dark and its panels light; Next.js' dev "N" button covers the SQL count bottom left; was: covered the last card #011; on eShop at 360 the card fits and shows no route name; P04 (static site, 360): Server and Database read "—" with nothing to explain why; was: on for every visitor of her site #103 (now `?wizelens-hud=on`) | P01, P03, P04 |
| HUD details panel | `HUD › details` | 6 → 8 | 8 | on a phone the full call name is only in a hover title, which touch cannot open; was: method cut and axis labels overlapped at 360 #023; was: "Calls · 0" above the page row #079 | P01, P03 |

### Site · wizelens.com — 19 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Home | `/` | 8 | 8 | light only (site has no dark theme); hero demo shows only the logo for ~3 s before it plays; 12px grey footnote under the buttons is hard to read | P01 |
| angular | `/angular` | — | — | — | — |
| changelog | `/changelog` | 8 | 8 | light only; 20 version chips before any content at 360px | P01 |
| cloud | `/cloud` | — | — | — | — |
| dotnet | `/dotnet` | 8 | 8 | the Program.cs code box is empty for the first seconds; the package version is not on the page (NuGet picks it); light only (no dark theme on the site); was: "Requires .NET 10 or newer" #051 | P03 |
| go | `/go` | — | — | — | — |
| java | `/java` | — | — | — | — |
| license | `/license` | — | — | — | — |
| node | `/node` | — | — | — | — |
| pricing | `/pricing` | — | — | — | — |
| privacy | `/privacy` | — | — | — | — |
| python | `/python` | — | — | — | — |
| react | `/react` | 8 | 6 → 8 | light only; was: Set it up opened React docs for a Next.js dev #001 | P01 |
| security | `/security` | — | — | — | — |
| story | `/story` | — | — | — | — |
| svelte | `/svelte` | — | — | — | — |
| terms | `/terms` | — | — | — | — |
| vue | `/vue` | — | — | — | — |
| Docs home | `/docs` | — | — | — | — |

### Site · docs — 35 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| ai-access | `/docs/ai-access` | — | — | — | — |
| alerts | `/docs/alerts` | — | — | — | — |
| aspnet-core | `/docs/aspnet-core` | — | — | — | — |
| auto-install | `/docs/auto-install` | — | — | — | — |
| browser | `/docs/browser` | — | — | — | — |
| cloud | `/docs/cloud` | — | — | — | — |
| configuration | `/docs/configuration` | — | — | — | — |
| dashboard | `/docs/dashboard` | — | — | — | — |
| dashboards | `/docs/dashboards` | — | — | — | — |
| errors | `/docs/errors` | — | — | — | — |
| go | `/docs/go` | — | — | — | — |
| hub | `/docs/hub` | — | — | — | — |
| hud | `/docs/hud` | — | — | — | — |
| insights | `/docs/insights` | — | — | — | — |
| java | `/docs/java` | — | — | — | — |
| kubernetes | `/docs/kubernetes` | — | — | — | — |
| logs | `/docs/logs` | — | — | — | — |
| nextjs | `/docs/nextjs` | 8 | 8 | light only; no section for upgrading an app that already has WizeLens (only one line: delete .next) | P01 |
| node | `/docs/node` | — | — | — | — |
| problems | `/docs/problems` | — | — | — | — |
| production | `/docs/production` | — | — | — | — |
| python | `/docs/python` | — | — | — | — |
| quick-start | `/docs/quick-start` | — | — | — | — |
| react | `/docs/react` | — | — | — | — |
| releases | `/docs/releases` | — | — | — | — |
| sampling | `/docs/sampling` | — | — | — | — |
| search | `/docs/search` | — | — | — | — |
| security | `/docs/security` | — | — | — | — |
| several-services | `/docs/several-services` | — | — | — | — |
| slos | `/docs/slos` | — | — | — | — |
| source-maps | `/docs/source-maps` | — | — | — | — |
| tags | `/docs/tags` | — | — | — | — |
| troubleshooting | `/docs/troubleshooting` | — | — | — | — |
| uptime | `/docs/uptime` | — | — | — | — |
| users | `/docs/users` | — | — | — | — |

---

## How this list was built

`node docs/personas/gen-screens.mjs .` from the repo root. It reads the menu (`js/packages/ui/src/shell/nav.ts`, with each item's `needs` capability against the in-app set), the section lists of Connect, Settings / Organization, People & access and Account, the detail-route helpers in `js/packages/ui/src/routes.ts` and its `AUTH_PAGES`, the site's `site/src/app` folders, and the docs in `site/content/docs`. A section whose label is computed (Connect › setup, server, options) is listed by its id.

Regenerate it the same way after any change that adds or removes a screen, and diff the result. A denominator that silently stops counting is worse than none.
