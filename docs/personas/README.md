# WizeLens — persona testing

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-26

Two real WizeLens users, each set up from nothing in a real app (kanNINJA v2:
Next.js 15 web, Fastify 5 API, Drizzle on postgres.js) and operated until their
job works or breaks. The rules are in [CLAUDE.md](CLAUDE.md); the screen scores
are in [rating.md](rating.md); the defects are in [issues/](issues/). What we
learned about the product before writing a persona is in
[discovery.md](discovery.md).

Each run produces:

| Output | What it is |
| --- | --- |
| **a recorded run** | every act with an outcome, in the persona file |
| **fixed defects** | every issue filed, fixed, and re-proved from the screen |
| **scored screens** | every screen opened, in light and dark and at 360px, with its gap to 10 |
| **a real working WizeLens setup** | complete for that person — the inventory in each persona file is its definition of done |

It is a repair pass judged by the WizeLens user, not a survey judged by a
developer. The question is never "is this implemented" — it is _could Dani
finish this job, and would they come back tomorrow?_

## Why 2, and why these 2

Brandon chose the two roles: a developer and a system / database admin. They
split WizeLens along its biggest real axis — **the host** — which selects
different code: the in-app dashboard (`/_wizelens`, served by lens-node inside
the app) and the cloud (`js/packages/cloud`, with accounts, orgs, keys, alerts,
uptime, SLOs and people). The same dashboard screens render differently on each,
and half the cloud's screens do not exist in-app at all.

## The roster

| # | Persona | Role | Host | Status |
| --- | --- | --- | --- | --- |
| P01 | [Dani Okonkwo-Brennan](01-dani-kanninja-developer.md) | developer | in-app dashboard + HUD | not started |
| P02 | [Greta Lindqvist-Ochoa](02-greta-kanninja-dba.md) | system and database admin | WizeLens Cloud | not started |

## What each one is the only proof of

| # | Nothing else in the roster covers this |
| --- | --- |
| P01 | **The spine, deeply.** Site → docs → upgrade a real Next.js + Node app → first trace on `/_wizelens` → the HUD on a real page → one click as one trace across two services |
| P02 | **The cloud and the edges.** Sign-up with 2FA, per-service keys, alerts by email, uptime, SLOs, least access, retention, a key revoked by mistake, and a neighbour org that must stay invisible |

## Run order

`P01 → P02`

P01 makes the traffic P02 watches: P02's cloud shows P01's board. P02 needs a
mature app underneath it (real data, real errors), so it goes last.

Because defects are fixed inside the run that finds them, P01 will absorb the
shared dashboard repairs; P02 should be almost entirely about the cloud. **If P02
is still finding in-app dashboard defects, P01 did not fix what it found.**

## Screen coverage

WizeLens ships **177 rateable screens** across the in-app dashboard, the cloud,
the cloud's account screens, the HUD, the site and the docs. Every one is a row
in [rating.md](rating.md), generated from the code by
[gen-screens.mjs](gen-screens.mjs) so the denominator is real.

Two runs will not open all 177. The first count, 169, missed eight detail pages (one service, problem, uptime check, host, Kubernetes node and pod); P02 found two of them by using them. **Those rows stay `—`, deliberately.** An unrated
screen is unrated; it is never assumed fine because a sibling scored well
(CLAUDE.md RULE #4).

## Coverage this roster deliberately does not have

- **.NET, Python, Java and Go.** No local .NET on this machine; both personas run Node and Next.js.
- **Vue, Angular, Svelte and the script tag.** kanNINJA is React; the shared HUD web component is seen only through React.
- **The hub** (`wizelens-hub`, self-hosted collector) and **ClickHouse scale mode**: the cloud here runs on PGlite.
- **Hosts and Kubernetes** with real infra data: no infra collector runs.
- **Billing.** No Stripe account is connected to the local cloud; plans, checkout and overage are not exercised.
- **Real mail delivery.** Mail is read from the cloud's and kanNINJA's console logs, not from an inbox.
- **SSO and SCIM.** No identity provider is set up.
- **Load.** Two accounts is a correctness exercise, not a performance one.

An honest gap list is worth more than a roster that claims to cover everything.
