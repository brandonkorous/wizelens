# WizeLens — screen ratings

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-26

Every screen in WizeLens, scored on **Design** and **Ease** as the personas open
them. How and when to score is RULE #6 in [CLAUDE.md](CLAUDE.md); this file is
where the numbers live.

**Scored so far: 45 of 177 screens.** Update that line as rows fill in —
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
- **.NET, Python, Java and Go add-ons.** Brandon has no local .NET; these personas run Node and Next.js only.

They are not listed below and are not scored. **If a persona ever reaches one, that
is a `major` issue, not a rating.**

---


### Dashboard · in-app (/_wizelens) — 39 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Overview | `#/` | 8 | 7 | at 360 the six stat cards stack one per row (~850 px) before the first chart; "No data for previous day" on every card on day one; was: time axis overlapped at 360 #022 | P01 |
| Problems | `#/problems` | — | — | — | — |
| Search | `#/search` | 8 | 7 | runs only on Enter, unlike the list boxes beside it (#014); was: tabs and time axis overflowed at 360 #021 #022 | P01 |
| Requests | `#/requests` | 8 | 8 | Path cuts the end of long ids at 1440, so /clans and /members look alike; at 360 the filters fill the first screen | P01 |
| Traces | `#/traces` | 6 → 7 | 5 → 7 | list panel is a third of the width at 1440; was: search waited for Enter #014, 9-line paths #016, cross-origin traces read 2-3x long #015, pager overflowed at 360 #017 | P01 |
| Errors | `#/errors` | 8 | 7 | details panel starts below the fold at 1440; dev-restart ENOENT noise counts with app errors; Resolve lives on the hub/cloud #012 | P01 |
| Logs | `#/logs` | 7 | 6 → 7 | "Errors 173" (log lines) beside the Errors page's 65 (exceptions), two meanings of one word; was: search answered with unfiltered patterns #020 | P01 |
| Database | `#/database` | 8 | 8 | query text cut at 1440 with no wrap toggle; at 360 the filters fill the first screen | P01 |
| Rendering | `#/rendering` | — | — | — | — |
| Metrics | `#/metrics` | — | — | — | — |
| Services | `#/services` | — | — | — | — |
| Insights | `#/insights` | 8 | 8 | Endpoints column cuts the route (/api/v1/boards/:boardId/cards/:c…); was: N+1 count read as exact #010 | P01 |
| Security | `#/security` | — | — | — | — |
| Users | `#/users` | — | — | — | — |
| Connect | `#/connect` | 7 | 6 → 7 | read-only: every setting is code; was: Off with no way on #018, panel wider than a phone #021 | P01 |
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
| Trace compare | `#/traces/<a>/compare/<b>` | 7 | 5 → 7 | Total adds render to the fetch without saying so; was: "Same request" list read 48 ms for 17 ms loads #015, waterfall overflowed at 360 #021 | P01 |
| Error group | `#/errors/<group>` | — | — | — | — |
| Service endpoint | `#/services/<svc>/endpoints/<ep>` | — | — | — | — |
| Query shape | `#/database/queries/<sql>` | — | — | — | — |
| Page route | `#/rendering/routes/<route>` | — | — | — | — |
| User | `#/users/<user>` | — | — | — | — |
| Service | `#/services/<svc>` | — | — | — | — |
| Problem | `#/problems/<id>` | — | — | — | — |

### Dashboard · cloud — 70 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Overview | `#/` | 8 | 7 | at 360 the six stat cards stack one per row before the first chart; "No data for previous 7 days" on every card while the org is a day old; was: top bar ran off the screen #046 | P02 |
| Problems | `#/problems` | — | — | — | — |
| Search | `#/search` | 8 | 7 | runs only on Enter, unlike the list boxes beside it; was: top bar ran off the screen #046 | P02 |
| Requests | `#/requests` | 8 | 8 | at 360 the filters fill the first screen; Path cuts long ids at 1440; was: top bar #046 | P02 |
| Traces | `#/traces` | 7 | 7 | list panel is a third of the width at 1440; at 360 the list starts below four stat cards; was: top bar #046 | P02 |
| Errors | `#/errors` | 8 | 7 | at 360 five menus and two boxes fill the first screen; the details panel starts below the fold at 1440; was: top bar #046 | P02 |
| Logs | `#/logs` | — | — | — | — |
| Database | `#/database` | 8 | 8 | query text cut at 1440 with no wrap toggle; at 360 the filters fill the first screen; was: top bar #046 | P02 |
| Rendering | `#/rendering` | — | — | — | — |
| Metrics | `#/metrics` | — | — | — | — |
| Services | `#/services` | 8 | 7 | `localhost:3001` (the web app's calls to the API) is listed as its own Unhealthy service beside `kanninja-backend`, the same API; two tables name the same services; was: top bar #046 | P02 |
| Hosts | `#/hosts` | — | — | — | — |
| Kubernetes | `#/kubernetes` | — | — | — | — |
| Insights | `#/insights` | — | — | — | — |
| Security | `#/security` | — | — | — | — |
| Users | `#/users` | — | — | — | — |
| Alerts | `#/alerts` | 7 → 8 | 7 | five controls on every rule row (Mute, Turn off, Test, Edit, Delete); was: Rule column one letter wide at 360 #047, top bar #046 | P02 |
| Uptime | `#/uptime` | 8 | 8 | "Average of the checks that are on" is cut at 1440; at 360 the checks table starts below four cards | P02 |
| SLOs | `#/slos` | 7 → 8 | 8 | Apdex targets share the page with SLOs as a second idea with no heading link between them; was: Goal column one letter wide at 360 #047 | P02 |
| Dashboards | `#/dashboards` | — | — | — | — |
| Connect | `#/connect` | — | — | — | — |
| People & access | `#/people` | — | — | — | — |
| Organization | `#/organization` | — | — | — | — |
| Connect › setup | `#/connect/setup` | 8 | 8 | env lines are small mono at 360 and wrap mid-value; copy buttons sit far right of the value | P02 |
| Connect › server | `#/connect/server` | — | — | — | — |
| Connect › Sending keys | `#/connect/keys` | 7 → 8 | 8 | during a rotate the old and new secrets are two rows with one name, told apart only by "In a day"; was: Projects column split letters at 360 #047, revoke said nothing about use #042 | P02 |
| Connect › AI read keys | `#/connect/read-keys` | — | — | — | — |
| Organization › Projects | `#/organization/projects` | 8 | 8 | at 360 Rename, Access, Clear data and Delete sit off to the right inside the table scroll | P02 |
| Organization › Data retention | `#/organization/retention` | 8 | 8 | the hint under Days is small muted text; was: shortening asked nothing and showed old days #044, logs vs traces rule unclear #045 | P02 |
| Organization › Thresholds and hidden keys | `#/organization/checks` | 8 | 8 | hints under the two numbers are small muted text | P02 |
| Organization › Tags | `#/organization/tags` | — | — | — | — |
| Organization › Billing | `#/organization/billing` | — | — | — | — |
| Organization › General | `#/organization/general` | 8 | 8 | "Delete this organization" sits right under the name box (the typed name and password guard it) | P02 |
| People & access › Members | `#/people/members` | 8 | 8 | at 360 "Member since" moves into the table scroll | P02 |
| People & access › Project access | `#/people/access` | — | — | — | — |
| People & access › Single sign-on | `#/people/sso` | — | — | — | — |
| People & access › User sync (SCIM) | `#/people/scim` | — | — | — | — |
| People & access › Connected apps | `#/people/apps` | — | — | — | — |
| People & access › Shared links | `#/people/links` | — | — | — | — |
| People & access › Audit log | `#/people/audit` | 7 → 8 | 8 | at 360 What and Detail move into the table scroll; was: revoked key unnamed #048, cancelled invite unnamed #040, no "how long ago" #041 | P02 |
| Account › Profile | `#/account/profile` | — | — | — | — |
| Account › Devices | `#/account/devices` | — | — | — | — |
| Account › Preferences | `#/account/preferences` | — | — | — | — |
| Account › Emails | `#/account/emails` | — | — | — | — |
| Account › Delete account | `#/account/delete` | — | — | — | — |
| Account › Security | `#/account/security` | 8 | 8 | "Turn off" two-step is a solid red button beside "New backup codes" | P02 |
| Connect › options | `#/connect/options` | — | — | — | — |
| Trace › Timeline | `#/traces/<id>` | 8 | 7 | a browser-only trace reads "Network and other 4.84 s" with one span bar and no word on what took the time; at 360 the tabs scroll | P02 |
| Trace › SQL | `#/traces/<id>/sql` | — | — | — | — |
| Trace › HTTP | `#/traces/<id>/http` | — | — | — | — |
| Trace › Messages | `#/traces/<id>/messages` | — | — | — | — |
| Trace › Logs | `#/traces/<id>/logs` | — | — | — | — |
| Trace › Errors | `#/traces/<id>/errors` | — | — | — | — |
| Trace compare | `#/traces/<a>/compare/<b>` | — | — | — | — |
| Error group | `#/errors/<group>` | 7 → 8 | 7 | Next.js's own failed telemetry call (dev only) shows as a kanninja-frontend error, true but noise; was: buttons ran off the screen at 360 #049 | P02 |
| Service endpoint | `#/services/<svc>/endpoints/<ep>` | — | — | — | — |
| Query shape | `#/database/queries/<sql>` | 8 | 8 | at 360 the SQL wraps to 7 lines before the numbers; the copy button is under the text, not beside it | P02 |
| Page route | `#/rendering/routes/<route>` | — | — | — | — |
| User | `#/users/<user>` | — | — | — | — |
| Service | `#/services/<svc>` | 8 | 8 | at 360 the facts (kind, hosts, version…) fill the first screen before a number; was: top bar #046 | P02 |
| Problem | `#/problems/<id>` | — | — | — | — |
| Alert rule | `#/alerts/<id>` | 8 | 8 | the line starts on the day the rule was made, so most of the 7-day chart is blank with no word on why; was: link said traces and opened queries #036, lost after two-step sign-in #035 | P02 |
| SLO | `#/slos/<id>` | 8 | 6 | an outage spends no budget here; the page now says so (#038, decision); the budget chart is a flat line at 0 once spent | P02 |
| Dashboard | `#/dashboards/<id>` | — | — | — | — |
| Shared page (signed out) | `#/shared/<token>` | — | — | — | — |
| Status page | `#/status/<slug>` | — | — | — | — |
| Uptime check | `#/uptime/<id>` | 8 | 8 | on day one the 30-day card reads the same as 24 h and does not say how much is measured; was: counted from before the first run #037 | P02 |
| Host | `#/hosts/<name>` | — | — | — | — |
| Kubernetes node | `#/kubernetes/node/<name>` | — | — | — | — |
| Kubernetes pod | `#/kubernetes/pod/<ns>/<name>` | — | — | — | — |

### Cloud · account screens — 12 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Sign in | `(signed out)` | — | — | — | — |
| Create account | `(signed out)` | — | — | — | — |
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

Sign in, Create account, two-factor and invite were opened by P02 (acts 1, 7 and 9) in light at 1440 only, so they are not scored (RULE #6).

### HUD (in the app's own page) — 2 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| HUD card | `bottom corner of the app` | 8 | 7 → 8 | on a light page the card is dark and its panels light; Next.js' dev "N" button covers the SQL count bottom left; was: covered the last card #011 | P01 |
| HUD details panel | `HUD › details` | 6 → 8 | 8 | on a phone the full call name is only in a hover title, which touch cannot open; was: method cut and axis labels overlapped at 360 #023 | P01 |

### Site · wizelens.com — 19 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Home | `/` | 8 | 8 | light only (site has no dark theme); hero demo shows only the logo for ~3 s before it plays; 12px grey footnote under the buttons is hard to read | P01 |
| angular | `/angular` | — | — | — | — |
| changelog | `/changelog` | 8 | 8 | light only; 20 version chips before any content at 360px | P01 |
| cloud | `/cloud` | — | — | — | — |
| dotnet | `/dotnet` | — | — | — | — |
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
