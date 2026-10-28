# WizeLens — persona testing

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-27

Five real WizeLens users, each set up from nothing in a real app and operated
until their job works or breaks: kanNINJA v2 (Next.js 15 web, Fastify 5 API,
Drizzle on postgres.js) for P01, P02 and P05; Microsoft's eShopOnWeb (.NET 8,
EF Core on SQL Server) for P03; a static Vite site for P04. The rules are in [CLAUDE.md](CLAUDE.md); the screen scores
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
| P01 | [Dani Okonkwo-Brennan](01-dani-kanninja-developer.md) | developer | in-app dashboard + HUD | done |
| P02 | [Greta Lindqvist-Ochoa](02-greta-kanninja-dba.md) | system and database admin | WizeLens Cloud | done |
| P03 | [Sid Ramaswamy-Kowalczyk](03-sid-eshop-dotnet-developer.md) | .NET developer | in-app dashboard served by the .NET SDK + HUD on Razor pages | done |
| P04 | [Noor Haddad-Pellegrini](04-noor-static-site-phone.md) | front-end only, on a phone | WizeLens Cloud, browser script tag | done |
| P05 | [Marisol Teixeira-Wójcik](05-marisol-credit-union-admin.md) | team admin | WizeLens Cloud: SSO, people, billing | done |

## What each one is the only proof of

| # | Nothing else in the roster covers this |
| --- | --- |
| P01 | **The spine, deeply.** Site → docs → upgrade a real Next.js + Node app → first trace on `/_wizelens` → the HUD on a real page → one click as one trace across two services |
| P03 | **The .NET spine on a framework he cannot change.** NuGet on .NET 8, EF Core on SQL Server, Razor pages with the HUD, a WebAssembly admin calling an API |
| P04 | **The negative space.** No server at all: the script tag, a browser key, a person who does not read code, every screen on a phone with thumbs |
| P05 | **The conditions.** Stripe test-mode billing, SSO-only sign-in from Keycloak, offboarding from one place, least access proved both ways, spend limits, an audit export |
| P02 | **The cloud and the edges.** Sign-up with 2FA, per-service keys, alerts by email, uptime, SLOs, least access, retention, a key revoked by mistake, and a neighbour org that must stay invisible |

## Run order

`P01 → P02 → P03 → P04 → P05`

Added 2026-10-27 to raise the product from 7.5 to 9 (46 of 177 screens scored after P02). P03 and P04 have the most different spines (another language; no server), so they go first; P05 needs a mature cloud and real billing, so it goes last.

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

- **Python, Java and Go.** .NET is covered by P03 (the SDK builds here after the env fix in the repo notes).
- **Vue, Angular and Svelte.** React through npm (P01) and the plain script tag (P04) are covered; the other frameworks are not.
- **The hub** (`wizelens-hub`, self-hosted collector) and **ClickHouse scale mode**: the cloud here runs on PGlite.
- **Hosts and Kubernetes** with real infra data: no infra collector runs.
- **Real mail delivery.** Mail is read from the cloud's and kanNINJA's console logs, not from an inbox.
- **SSO from a hosted provider** (Okta, Entra ID). P05 uses Keycloak locally.
- **Load.** Two accounts is a correctness exercise, not a performance one.

An honest gap list is worth more than a roster that claims to cover everything.
