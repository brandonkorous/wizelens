# P03 — Siddharth "Sid" Ramaswamy-Kowalczyk · Ashgrove & Peña Outdoor Supply

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-27

**Status:** not started
**Run:** — (America/Los_Angeles, UTC-7 until 2026-11-01, then UTC-8), Claude driving Chrome
**Role:** .NET developer · in-app dashboard served by WizeLens.AspNetCore + the HUD on Razor pages

## Account

| Field | Value |
| --- | --- |
| eShop customer account | `p03.sid@ashgrovepena.test` |
| Password | `Lantern-Orchard-42!` |
| eShop admin (seeded by eShop) | `admin@microsoft.com` (eShop's own seed password, read from its seed file) |
| Store | https://localhost:5001 (Web) · https://localhost:5099 (PublicApi) |
| WizeLens dashboards | https://localhost:5001/_wizelens · https://localhost:5099/_wizelens (if the docs say each service has one) |

Fill these in as soon as setup gives them to you.

## The person

Siddharth "Sid" Ramaswamy-Kowalczyk, 44, he/him. Fifteen years of C#, from Web
Forms to minimal APIs. The only developer at a two-shop outdoor gear business;
he also answers the phone when the till breaks.

**Technical level.** High in .NET, low in front-end. Lives in Visual Studio and
SQL Server Management Studio. Used Glimpse on ASP.NET MVC 5 in 2014 and misses it.
Has never used an APM. Does not want Docker, YAML or a sales call.

**What he is nervous about.** The store is pinned to .NET 8 (LTS) because the
payment terminal's library is not ready for anything newer. If a tool makes him
upgrade the framework, it is out — and he will only find that out after he has
spent his lunch on it.

**What made him look today.** Black Friday is 31 days away. Last year the basket
page "went slow" at 7 pm and he never learned why. He searched "glimpse for
asp.net core" and landed on wizelens.com.

## The business

**Ashgrove & Peña Outdoor Supply** — tents, stoves and wool layers. Two shops
(Visalia and Three Rivers) and an online store run on a fork of Microsoft's
eShopOnWeb (Razor Pages web, a Blazor WebAssembly admin, a PublicApi with JWT, EF
Core on SQL Server).

- 1,240 online orders last year; 38% of them in November and December
- The catalog has 212 products; the biggest basket last year had 27 lines
- The admin edits the catalog in the Blazor admin, which calls PublicApi from the
  browser — two services and a browser in one job
- **Inconvenient for the software:** the store targets **.NET 8** and cannot move;
  SQL Server, not Postgres; HTTPS on localhost with a dev certificate; and the
  admin is WebAssembly, not server pages

## Why he is here today

1. "Show me every SQL query the basket page runs, like Glimpse did."
2. "When the admin saves a product, I want the browser, the API and the SQL in one picture."
3. "Customer passwords and card bits must never show up in this thing."

## Setup answers

| Question | Answer |
| --- | --- |
| Stack picked on the site | `ASP.NET Core` |
| Framework | `net8.0` — not negotiable |
| Package manager | `dotnet add package` (NuGet) |
| Database | SQL Server LocalDB (`(localdb)\mssqllocaldb`), as eShopOnWeb ships |
| HUD | on, Development only |

## The data

**This is the test data. Type it as written** (RULE #2). Products go in through
the eShop admin (Blazor), as Sid would.

### Products (at least 12; typed exactly)

| # | Name | Brand | Type | Price (USD) | Description |
| --- | --- | --- | --- | --- | --- |
| 1 | `Peña Ridge 2-Person Tent — 3-season, 1.9 kg` | `.NET` | `T-Shirt` | 289.99 | `Free-standing, two doors, two vestibules; poles are DAC NSL 8.7 mm.` |
| 2 | `Ashgrove Merino 200 Crew (Women's) — Slate` | `Other` | `T-Shirt` | 84.50 | `18.5 µm merino, flatlock seams, no itch.` |
| 3 | `Kowalczyk Camp Stove "Żar" — 3,400 W` | `Other` | `Mug` | 119.00 | `Piezo ignition; simmers at 300 W; fits 100 g & 230 g canisters.` |
| 4 | `Sierra Nevada Trail Map Set (Mineral King + Kaweah), waterproof` | `Other` | `Sheet` | 24.95 | `1:40,000; UTM grid; printed on Polyart.` |
| 5 | `Ultralight Spork, titanium (0.6 oz)` | `Other` | `Mug` | 9.99 | `—` |
| 6 | `Bear canister BV500 — required above 9,000 ft in Sequoia NP` | `Other` | `Mug` | 94.95 | `Holds ~7 days of food for one person; rangers check.` |
| 7 | `Down Jacket "Ó Briain" 800-fill, hood, men's L` | `Other` | `T-Shirt` | 329.00 | `RDS-certified down; 290 g total; packs into its own pocket.` |
| 8 | `Gift Card — $0.01 test-of-rounding line` | `Other` | `Sheet` | 0.01 | `For checking totals: 3 × $0.01 must make $0.03.` |
| 9 | `Rain Shell 3L "Three Rivers" — women's S` | `Other` | `T-Shirt` | 199.99 | `20k/20k membrane, pit zips, helmet-compatible hood.` |
| 10 | `Water Filter (0.1 µm) + 2 × 1 L soft flasks` | `Other` | `Mug` | 54.49 | `Back-flush syringe included.` |
| 11 | `Headlamp 450 lm, USB-C, red mode` | `Other` | `Mug` | 39.99 | `IPX4; 4 h on high, 60 h on low.` |
| 12 | `Long-description test: the Peña Ridge footprint fits only the 2-person tent; it is cut 5 cm smaller than the floor on every side so rain runs off instead of pooling, and it clips to the pole ends with four aluminium G-hooks.` | `Other` | `Sheet` | 39.00 | same as the name |

Brands and types are eShop's seeded lists; Sid uses what the form offers and says
so if it offers nothing that fits.

### Baskets and orders (as `p03.sid@ashgrovepena.test`)

- **Basket A, 27 lines:** one of every product above, then 15 more of the seeded
  items, quantities 1–4. It must page or scroll at 360px.
- **Order 1:** Basket A, shipping to `Ashgrove & Peña Outdoor Supply, 41180 Sierra Dr, Three Rivers, CA 93271`.
- **Order 2:** three of product 8 only — the total must read $0.03.

---

## The setup he leaves with

**This list is the definition of done** (RULE #8).

| Item | What it must have |
| --- | --- |
| eShop on WizeLens, still on .NET 8 | Web and PublicApi send to WizeLens, from the site's own instructions, without changing `net8.0` |
| The basket page's SQL | every EF Core query of one basket page load visible, its count matching a hand count, the slowest named |
| One admin save, one trace | saving product 1 in the Blazor admin is ONE trace: the browser fetch, PublicApi's request and its SQL |
| The HUD on a Razor page | the HUD on `/Basket` shows the page, Server and DB that add up, and lists every call |
| An error, found | the error from act 8 in Errors with its .NET stack and the request that caused it |
| Logs tied to requests | the `ILogger` lines of one checkout in Logs and in that trace's Logs tab |
| Nothing secret | no password hash, security stamp, JWT or card text in any SQL, log or attribute the dashboard shows |
| A cloud copy | the same two services sending to a WizeLens Cloud project named `Ashgrove & Peña — Online Store`, with one ingest key per service |

**Working end to end:** a contractor Sid hires for Black Friday opens his trace
link and sees what he saw.

**The look.** Not P01's Node workbench: a .NET shop's server pages, a WebAssembly
admin, and SQL Server — the in-app dashboard served by the .NET SDK, not by Node.

**Also required:** both themes, 360px, keyboard only for one full job.

---

## The run

### Act 1 — find WizeLens and the .NET instructions

From http://localhost:5190/, Sid looks for ASP.NET Core and reads what it needs.

**Done when:** Sid has the exact package name, the version, and the lines to add to
`Program.cs`, all from the site, and knows which .NET versions it supports.

**Outcome:** —

### Act 2 — install it into eShop, on .NET 8

He adds the package to Web and PublicApi as the docs say and builds.

**Done when:** both projects build and run on `net8.0` with WizeLens in them, and
the minutes from `dotnet add package` to the first trace are recorded.

**Outcome:** —

### Act 3 — the first trace

He opens the store home page and then the dashboard.

**Done when:** the home page request is in the dashboard with its EF Core SQL
against SQL Server, and Sid can say what the dashboard is for in one sentence.

**Outcome:** —

### Act 4 — make real data

As the eShop admin he adds the 12 products; as himself he signs up, fills Basket A,
and places Orders 1 and 2.

**Done when:** all 12 products are in the catalog as typed, both orders are placed,
and Order 2's total reads $0.03 in eShop.

**Outcome:** —

### Act 5 — what does the basket page cost?

He loads `/Basket` with Basket A (27 lines) and reads its SQL.

**Done when:** Sid counts the SQL calls by hand, the count matches the dashboard,
and any repeated query shape is named by the dashboard's insight (or it says none).

**Outcome:** —

### Act 6 — the HUD on a Razor page

He turns the HUD on and reloads `/Basket`.

**Done when:** the HUD names the page, Server and DB add up to the calls it lists,
and each call opens its trace.

**Outcome:** —

### Act 7 — one admin save

In the Blazor admin he edits product 1's price to 279.99 and saves.

**Done when:** one trace holds the browser fetch, PublicApi's PUT and its SQL; or
the run records exactly where the chain breaks.

**Outcome:** —

### Act 8 — the mistake he has to undo

He deletes product 6 (the bear canister) from the admin while it is still in
Basket A and in Order 1, then opens his basket and his order history.

**Done when:** whatever eShop does (error or not) is visible in WizeLens with its
request, and Sid can tell from the dashboard which page broke and why.

**Outcome:** —

### Act 9 — logs for one checkout

He places Order 2 again and looks for its log lines.

**Done when:** the `ILogger` lines of that checkout are in Logs, in the trace's Logs
tab, and nothing secret is in them.

**Outcome:** —

### Act 10 — nothing secret

He signs up a second customer, `Zoë Nakamura-Ó Briain`, `p03.zoe@ashgrovepena.test`,
and reads every SQL param and log line of that sign-up.

**Done when:** no password hash, security stamp, token or email shows in clear
(emails as `[redacted:email]`), in the in-app dashboard and in the cloud.

**Outcome:** —

### Act 11 — send a copy to the cloud

He makes a cloud org `Ashgrove & Peña` and project `Ashgrove & Peña — Online Store`,
one ingest key per service, and points both services at it.

**Done when:** both services and the browser show on the cloud's Services page,
and act 7's trace link works in the cloud too.

**Outcome:** —

---

## What only this persona proves

The .NET spine on a framework he cannot change: the NuGet install on .NET 8, EF
Core on SQL Server, Razor pages with the HUD, a WebAssembly admin calling an API,
and the in-app dashboard served by the .NET SDK.

---

## Standing checks

**Wrong moves.** Delete a product that is in a basket and an order (act 8). Press
Back after "Place order" and submit again — does eShop make two orders, and does
WizeLens show two POSTs? Add the same product twice from two tabs.

**Reload and deep link.** F5 on a trace's SQL tab served by the .NET SDK; open a
trace link in a new window; open `https://localhost:5001/_wizelens/#/database`
straight from the address bar.

**Dates.** Place an order at 23:59 on 2026-10-31 machine time if the run reaches it,
otherwise read the time WizeLens shows for Order 1 against the machine clock and the
eShop order page. Say which timezone.

**Numbers at the edges.** Order 2: 3 × $0.01 = $0.03 in eShop. Sum the spans of the
act 7 trace by hand; count the basket page's SQL by hand.

**The other side.** Zoë signs in and opens her empty order history; the trace for
that page must exist and show her request, not Sid's.

**Without a mouse.** Act 5, keyboard only: from the dashboard home to the basket
page's slowest query, focus visible all the way.

**Somebody else's data.** In the cloud, search for `Harrow & Vance` and for
`kanninja`: P02's orgs must not appear. Paste a kanNINJA trace id into Sid's cloud
project and say what happens.

---

## Verification

Filled in at the end, honestly, **including what was skipped** (RULE #4).

| | Result |
| --- | --- |
| Acts completed | — |
| Issues filed | — |
| Issues fixed and confirmed | — |
| Issues blocked, and on what | — |
| Screens scored | — |
| **Not checked** | — |

### The numbers

| Record | Result |
| --- | --- |
| Minutes from `dotnet add package` to the first trace | — |
| Basket page SQL (hand vs. screen) | — |
| Admin save: services and spans in one trace | — |

---

## Run log
