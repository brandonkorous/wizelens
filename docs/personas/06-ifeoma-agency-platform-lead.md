# P06 — Ifeoma Castellanos-Lindgren · buying WizeLens for an agency with every stack

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-28

**Status:** done
**Run:** 2026-10-28, from 17:45 (America/Los_Angeles, UTC-7), Claude driving headless Chrome at 1440 × 900 and 360 × 780 (touch), light and dark
**Role:** platform lead · evaluates, then owns the agency's WizeLens Cloud org · every stack, VMs and a cluster

## Account

| Field | Value |
| --- | --- |
| Cloud email | `p06.ifeoma@larchmont-digital.test` |
| Password | `Lantern-Orchard-42!` |
| Cloud organization | `Larchmont Digital — Client Platform` |
| Projects | `Ostrava Bikes — Django shop`, `Hälsa Clinics — booking API (Go)` |

Fill these in as soon as sign-up gives them to you.

## The person

Ifeoma Castellanos-Lindgren, 41, they/them. Platform lead at Larchmont Digital.
They run the servers, the cluster and the on-call rota for 31 client apps.

**Technical level.** High on infrastructure, medium on any one language. Reads
Python, Go and Java; has run Datadog and Grafana; signs the vendor forms.

**What they are nervous about.** Signing a contract the lawyers then reject, and
a tool that covers two of their stacks and calls itself complete.

**What made them look today.** The agency's Datadog bill doubled. The CEO asked
for "one tool, every stack, a price we can predict" by Friday.

## The business

**Larchmont Digital** — 22 people, 31 client apps, one on-call rota.

- Stacks: Django (Python 3.12), Go 1.23 APIs, a Spring Boot 3 (Java 21) app,
  front ends in Vue 3, Svelte 5 and Angular 19, two Node services
- Hosts: four Ubuntu VMs and one small Kubernetes cluster
- Clients include a Czech bike shop and a Swedish clinic group, so data rules
  (GDPR, a data processing agreement) decide the purchase
- **Inconvenient for the software:** they read *every* stack page, the legal pages
  and the pricing before they sign up, and they expect each claim to match the
  docs. Then they own the org: their profile, devices, emails, tags, who sees which
  project, user sync, connected apps, shared links, dashboards and a status page.

## Why they are here today

1. "Does it cover Python, Go, Java, Vue, Svelte and Angular — really, per the docs?"
2. "What will it cost for 31 apps, and will legal sign the terms?"
3. "Can I see my VMs and the cluster next to the apps?"
4. "Can I run the org: access, sync, links, a status page for clients?"

## Setup answers

| Question | Answer |
| --- | --- |
| Plan | read Pricing, pick what fits 31 apps; stay on the free plan for the run |
| Sign-in | email and password, then two-factor; a forgotten password once |
| Hosts | the collector from the docs, on this machine's Docker |
| Kubernetes | the chart from the docs, only on a cluster made for this run |

## The data

**This is the test data. Type it as written** (RULE #2).

| Field | Value |
| --- | --- |
| Organization | `Larchmont Digital — Client Platform` |
| Project 1 | `Ostrava Bikes — Django shop` |
| Project 2 | `Hälsa Clinics — booking API (Go)` |
| Tag | `client: Ostrava Bikes s.r.o.` |
| Colleague invited | `Ana-Lucía Ferreira-O'Donnell` · `p06.analucia@larchmont-digital.test` · Viewer on Ostrava only |
| Dashboard | `On-call — Monday 08:00 review` |
| Status page | `Hälsa Clinics — booking status` (slug `halsa-booking`) |
| Shared link | the slowest trace, for `Jiří Dvořák (Ostrava Bikes)` |
| Connected app | an MCP client named `Larchmont on-call assistant` |
| Host | `lmd-vm-ubuntu-03` (this machine's Docker, by the collector) |
| Second account (deleted at the end) | `p06.trial-delete@larchmont-digital.test` |

## Acts

### Act 1 — every stack page

Read Home, then each stack page the site offers (Node, Python, Go, Java, Vue,
Svelte, Angular, .NET, React), then Cloud and Story.

**Done when:** each stack page says what it covers and links to its docs page, and
each claim is on that docs page.

**Outcome:** done after #156 and #158. Home, all nine stack pages, Cloud and Story read at 1440 and 360. Each stack page links its docs page and each claim was found there. Code boxes could not be scrolled by keyboard (#156); the Cloud page's role names ran together on a phone (#158).

### Act 2 — price and paperwork

Read Pricing, Terms, Privacy, Security and License.

**Done when:** they can write the monthly cost for 31 apps, and name where the
data lives, who processes it, and how to report a security hole.

**Outcome:** done after #157 and #159. Pricing is by data, not by app: their estimate of 400 GB a month for the 31 apps is $134 on Team ($29 + 350 GB × $0.30) or $174 on Business ($99 + 250 GB × $0.30), from the calculator. Data lives on Microsoft Azure, Central US; processors are Azure and Stripe (Privacy); EU data residency is on Enterprise only, which matters for the Czech and Swedish clients. Security holes go to security@wizelens.com (Security). Faded plans and unlabeled cost bars (#157) and two menus both called "Docs" (#159) are fixed.

### Act 3 — the docs, end to end

Read the docs home and every docs page for their stacks and their jobs.

**Done when:** every page is reachable from the docs home, and no page leaves them
at a dead end.

**Outcome:** done after #154, #155 and #167. Every docs page is reachable from the docs home and links onward. Six pages were wider than a phone (#154); tables cut their last column (#155); the Python page's start command stopped a Django app (#167).

### Act 4 — sign up, two-factor, a forgotten password

Sign up, verify the email, make the org, turn on two-factor, sign out, use
"forgot password", reset it, sign in with the code.

**Done when:** they are signed in with the new password and a code.

**Outcome:** done after #160–#165. Signed up, verified the email, made the org, turned on two-step sign-in, signed out, reset the password from "forgot password" and signed in with the new password and a code. "Start free" opened sign-in (#160); dark buttons were hard to read (#161); "A new link is on its way" on a cloud with no mail (#163); engineer words in errors (#164).

### Act 5 — their own account

Profile, Devices, Preferences, Emails.

**Done when:** their name has its accent-free and accented forms right, a second
email is added, and they can see every signed-in device.

**Outcome:** done after #168, #169, #174 and #190. Their name is saved and shown as typed. An account has one email: they changed it to a second address and back (#168, #174 fixed the false "we sent" and the second link). Devices lists every sign-in, now without signing in again first (#190). Emails holds mail settings, not addresses.

### Act 6 — the org

Tags, Project access, User sync (SCIM), Connected apps (an MCP client by OAuth),
Shared links, an invite to Ana-Lucía.

**Done when:** Ana-Lucía can see Ostrava and not Hälsa, and every key or link they
made is listed where they can take it back.

**Outcome:** done after #166, #170–#178. Tag `client-ostrava` on Ostrava (#171, #173). Ana-Lucía invited as Viewer on Ostrava only; she sees Ostrava and not Hälsa. User sync (SCIM) needs Business, so it ran on P05's Business org: add, turn off, delete, each in the audit log with a name (#175). The MCP client "Larchmont on-call assistant" connected by OAuth to Ostrava only; its 17 tools see no Hälsa data (#176, #177). The trace link for Jiří Dvořák is listed under Shared links with who it is for (#178). Every key, app and link they made is listed where it can be revoked.

### Act 7 — the screens of a running org

Problems, Logs, Metrics, Insights, Security, Users, Dashboards (make one), a
status page, and the details behind each.

**Done when:** each screen says what it shows or why it is empty, in words they use.

**Outcome:** done after #179–#185. Problems explains its learning period; Logs, Metrics, Insights, Security and Users say what they show or why they are empty. Dashboard "On-call — Monday 08:00 review" with a p95 chart by route (#179). Status page "Hälsa Clinics — booking status" with three checks, opened signed out (#182, #183); the product gives an unguessable link, not the slug `halsa-booking`. Fixed on the way: Django 4xx lines outside their request (#181), the uptime runner listed as a service (#184), no metrics from Go (#185).

### Act 8 — hosts and the cluster

Run the collector from the docs for one host; follow the Kubernetes docs on a
cluster made for this run.

**Done when:** Hosts and Kubernetes show this machine and the cluster, or say
exactly what is missing.

**Outcome:** half done after #186–#188. The collector from the docs (`otel/opentelemetry-collector-contrib:0.137.0`, `host.yaml`) runs as `lmd-vm-ubuntu-03`; Hosts and its detail show CPU, memory, disks and network (#186 the disk card, #187 row clicks). Kubernetes: not checked on a cluster. Every kubectl context on this machine is production and the run may not touch them; the empty page now names the right recipe (#188). Waiting on a decision about a throwaway cluster.

### Act 9 — the trial account goes

Sign in as the second account and delete it.

**Done when:** the account is gone and its email can sign up again.

**Outcome:** done. `p06.trial-delete@larchmont-digital.test` signed up (it lands on Overview with a starter project, so "No organization yet" did not show), deleted itself from Account › Delete account ("Your account is deleted"), signed up again with the same email, and was deleted again.

## Deliverable inventory

- [x] Org `Larchmont Digital — Client Platform` with two projects
- [x] Two-factor on, password reset once
- [x] A second email on the account — one email per account; changed to a second one and back
- [x] Ana-Lucía invited, Viewer on Ostrava only
- [x] One tag, one dashboard, one status page, one shared link, one connected app
- [x] This machine on Hosts; the cluster on Kubernetes, or the gap written down — Kubernetes not checked (no cluster allowed)
- [x] The trial account deleted
- [x] A written cost for 31 apps, from Pricing — $134 (Team) or $174 (Business) at 400 GB a month

## Standing checks, for this persona

- **Isolation:** Ana-Lucía's session opens a Hälsa trace link and must be refused.
- **Regression:** P02's org (`p02mac`) still shows its own data after Act 6.
- **Dark and phone:** every screen in light and dark at 1440 and at 360.
- **Words:** each stack page and its docs page use the same names for the same
  setting.

## What only this persona proves

**The breadth.** Every stack page, every docs page, the legal pages, the account
and org pages nobody else opens, and the infrastructure screens.

## Outcomes

**Standing checks (2026-10-28):**

- Isolation: Ana-Lucía opened the address of a Hälsa trace at 17:35: "This trace is not in this project, or it is no
  longer stored." The MCP client granted Ostrava only found nothing for a Hälsa search.
- Regression: Greta's org (`p02mac`) at 17:35 shows its own `kanninja-backend` and `kanninja-frontend` and 2,253
  traces in 7 days, nothing of Larchmont's.
- Dark and phone: every screen they opened was scored in light and dark at 1440 and 360 (see `rating.md`).
- Words: the Python and Go stack pages and their docs pages use the same names for settings; the Django start command
  was missing from the docs (#167) and the Go metrics from both (#185).

**Issues:** 48, #154–#201, all fixed and re-proved on screen. #191–#201 came from the scoring pass: every unscored screen opened in light and dark at 1440 and 360.

**Scoring pass (2026-10-28, 18:00–18:55):** 113 screens scored, so `rating.md` holds 167 of 177. The 10 left are written down there with the reason (no cluster, no problem to open, cloud-only tabs, a fresh-cloud setup screen).
