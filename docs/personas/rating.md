# WizeLens — screen ratings

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-26

Every screen in WizeLens, scored on **Design** and **Ease** as the personas open
them. How and when to score is RULE #6 in [CLAUDE.md](CLAUDE.md); this file is
where the numbers live.

**Scored so far: 0 of 169 screens.** Update that line as rows fill in —
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


### Dashboard · in-app (/_wizelens) — 37 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Overview | `#/` | — | — | — | — |
| Problems | `#/problems` | — | — | — | — |
| Search | `#/search` | — | — | — | — |
| Requests | `#/requests` | — | — | — | — |
| Traces | `#/traces` | — | — | — | — |
| Errors | `#/errors` | — | — | — | — |
| Logs | `#/logs` | — | — | — | — |
| Database | `#/database` | — | — | — | — |
| Rendering | `#/rendering` | — | — | — | — |
| Metrics | `#/metrics` | — | — | — | — |
| Services | `#/services` | — | — | — | — |
| Insights | `#/insights` | — | — | — | — |
| Security | `#/security` | — | — | — | — |
| Users | `#/users` | — | — | — | — |
| Connect | `#/connect` | — | — | — | — |
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
| Trace › Timeline | `#/traces/<id>` | — | — | — | — |
| Trace › SQL | `#/traces/<id>/sql` | — | — | — | — |
| Trace › HTTP | `#/traces/<id>/http` | — | — | — | — |
| Trace › Messages | `#/traces/<id>/messages` | — | — | — | — |
| Trace › Logs | `#/traces/<id>/logs` | — | — | — | — |
| Trace › Errors | `#/traces/<id>/errors` | — | — | — | — |
| Trace compare | `#/traces/<a>/compare/<b>` | — | — | — | — |
| Error group | `#/errors/<group>` | — | — | — | — |
| Service endpoint | `#/services/<svc>/endpoints/<ep>` | — | — | — | — |
| Query shape | `#/database/queries/<sql>` | — | — | — | — |
| Page route | `#/rendering/routes/<route>` | — | — | — | — |
| User | `#/users/<user>` | — | — | — | — |

### Dashboard · cloud — 64 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Overview | `#/` | — | — | — | — |
| Problems | `#/problems` | — | — | — | — |
| Search | `#/search` | — | — | — | — |
| Requests | `#/requests` | — | — | — | — |
| Traces | `#/traces` | — | — | — | — |
| Errors | `#/errors` | — | — | — | — |
| Logs | `#/logs` | — | — | — | — |
| Database | `#/database` | — | — | — | — |
| Rendering | `#/rendering` | — | — | — | — |
| Metrics | `#/metrics` | — | — | — | — |
| Services | `#/services` | — | — | — | — |
| Hosts | `#/hosts` | — | — | — | — |
| Kubernetes | `#/kubernetes` | — | — | — | — |
| Insights | `#/insights` | — | — | — | — |
| Security | `#/security` | — | — | — | — |
| Users | `#/users` | — | — | — | — |
| Alerts | `#/alerts` | — | — | — | — |
| Uptime | `#/uptime` | — | — | — | — |
| SLOs | `#/slos` | — | — | — | — |
| Dashboards | `#/dashboards` | — | — | — | — |
| Connect | `#/connect` | — | — | — | — |
| People & access | `#/people` | — | — | — | — |
| Organization | `#/organization` | — | — | — | — |
| Connect › setup | `#/connect/setup` | — | — | — | — |
| Connect › server | `#/connect/server` | — | — | — | — |
| Connect › Sending keys | `#/connect/keys` | — | — | — | — |
| Connect › AI read keys | `#/connect/read-keys` | — | — | — | — |
| Organization › Projects | `#/organization/projects` | — | — | — | — |
| Organization › Data retention | `#/organization/retention` | — | — | — | — |
| Organization › Thresholds and hidden keys | `#/organization/checks` | — | — | — | — |
| Organization › Tags | `#/organization/tags` | — | — | — | — |
| Organization › Billing | `#/organization/billing` | — | — | — | — |
| Organization › General | `#/organization/general` | — | — | — | — |
| People & access › Members | `#/people/members` | — | — | — | — |
| People & access › Project access | `#/people/access` | — | — | — | — |
| People & access › Single sign-on | `#/people/sso` | — | — | — | — |
| People & access › User sync (SCIM) | `#/people/scim` | — | — | — | — |
| People & access › Connected apps | `#/people/apps` | — | — | — | — |
| People & access › Shared links | `#/people/links` | — | — | — | — |
| People & access › Audit log | `#/people/audit` | — | — | — | — |
| Account › Profile | `#/account/profile` | — | — | — | — |
| Account › Devices | `#/account/devices` | — | — | — | — |
| Account › Preferences | `#/account/preferences` | — | — | — | — |
| Account › Emails | `#/account/emails` | — | — | — | — |
| Account › Delete account | `#/account/delete` | — | — | — | — |
| Account › Security | `#/account/security` | — | — | — | — |
| Connect › options | `#/connect/options` | — | — | — | — |
| Trace › Timeline | `#/traces/<id>` | — | — | — | — |
| Trace › SQL | `#/traces/<id>/sql` | — | — | — | — |
| Trace › HTTP | `#/traces/<id>/http` | — | — | — | — |
| Trace › Messages | `#/traces/<id>/messages` | — | — | — | — |
| Trace › Logs | `#/traces/<id>/logs` | — | — | — | — |
| Trace › Errors | `#/traces/<id>/errors` | — | — | — | — |
| Trace compare | `#/traces/<a>/compare/<b>` | — | — | — | — |
| Error group | `#/errors/<group>` | — | — | — | — |
| Service endpoint | `#/services/<svc>/endpoints/<ep>` | — | — | — | — |
| Query shape | `#/database/queries/<sql>` | — | — | — | — |
| Page route | `#/rendering/routes/<route>` | — | — | — | — |
| User | `#/users/<user>` | — | — | — | — |
| Alert rule | `#/alerts/<id>` | — | — | — | — |
| SLO | `#/slos/<id>` | — | — | — | — |
| Dashboard | `#/dashboards/<id>` | — | — | — | — |
| Shared page (signed out) | `#/shared/<token>` | — | — | — | — |
| Status page | `#/status/<slug>` | — | — | — | — |

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

### HUD (in the app's own page) — 2 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| HUD card | `bottom corner of the app` | — | — | — | — |
| HUD details panel | `HUD › details` | — | — | — | — |

### Site · wizelens.com — 19 screens

| Screen | Key | Design | Ease | Gap to 10 | Persona |
| --- | --- | --- | --- | --- | --- |
| Home | `/` | — | — | — | — |
| angular | `/angular` | — | — | — | — |
| changelog | `/changelog` | — | — | — | — |
| cloud | `/cloud` | — | — | — | — |
| dotnet | `/dotnet` | — | — | — | — |
| go | `/go` | — | — | — | — |
| java | `/java` | — | — | — | — |
| license | `/license` | — | — | — | — |
| node | `/node` | — | — | — | — |
| pricing | `/pricing` | — | — | — | — |
| privacy | `/privacy` | — | — | — | — |
| python | `/python` | — | — | — | — |
| react | `/react` | — | — | — | — |
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
| nextjs | `/docs/nextjs` | — | — | — | — |
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
