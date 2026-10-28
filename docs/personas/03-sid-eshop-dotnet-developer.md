# P03 — Siddharth "Sid" Ramaswamy-Kowalczyk · Ashgrove & Peña Outdoor Supply

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-27

**Status:** in progress
**Run:** 2026-10-27, from 10:20 (America/Los_Angeles, UTC-7 until 2026-11-01, then UTC-8), Claude driving Chrome
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

**Outcome:** left the site at first, then done. The first paragraph of `/dotnet/` ended "Requires .NET 10 or newer."
and his store is `net8.0` (#051, decided: support .NET 8). After the fix the page reads "Runs on .NET 8, 9 and 10";
"Set it up" leads to the ASP.NET Core docs with `dotnet add package WizeLens.AspNetCore --prerelease` and the two
lines for `Program.cs`. The package version is not on the page; NuGet picks it (`0.3.0-alpha.13`).

### Act 2 — install it into eShop, on .NET 8

He adds the package to Web and PublicApi as the docs say and builds.

**Done when:** both projects build and run on `net8.0` with WizeLens in them, and
the minutes from `dotnet add package` to the first trace are recorded.

**Outcome:** done. `dotnet add package` in `src/Web` and `src/PublicApi`, `WizeLens.EntityFrameworkCore` in
`src/Infrastructure` (`UseSqlServer(...).UseWizeLens()`), the two lines in both `Program.cs` files. eShop stays on
`net8.0` and builds with 0 errors (NU1902/NU1903 warnings are eShop's own packages). About 3 minutes from
`dotnet add package` to the first trace, with the .NET 8 build of this branch from a local feed.

### Act 3 — the first trace

He opens the store home page and then the dashboard.

**Done when:** the home page request is in the dashboard with its EF Core SQL
against SQL Server, and Sid can say what the dashboard is for in one sentence.

**Outcome:** done. The store home page is `GET /` in Requests: 288 ms, 4 SQL (11 ms); its trace has 7 spans across
Web and the browser: `pageview /` 372 ms, `Handler GET /` 237 ms, `SELECT Catalog` ×2, `SELECT CatalogBrands`,
`SELECT CatalogTypes`. The Overview names `microsoft.sql_server · Microsoft.eShopOnWeb.CatalogDb` as a service.
In one sentence, Sid: "it shows each page my store served, with the SQL it ran and where the time went."
Found and fixed on the way: #052 (Services card hid Status), #053 (Apdex card cut "target 500 ms"), #054 (chart
axis 0, 38, 75, 113, 150), #055 (17 file requests per page buried the pages).
Open for act 6: the request panel says "Rendering –" while the HUD showed "Render 75 ms" for the same page.

### Act 4 — make real data

As the eShop admin he adds the 12 products; as himself he signs up, fills Basket A,
and places Orders 1 and 2.

**Done when:** all 12 products are in the catalog as typed, both orders are placed,
and Order 2's total reads $0.03 in eShop.

**Outcome:** done, with eShop limits. Products 4, 6 and 12 failed first: their names are over eShop's 50-character
`Catalog.Name`. WizeLens Errors showed the `SqlException` with its SQL, params and logs, so Sid shortened them
(ids 501–511, 522–524). eShop seeds only 12 items, so Basket A is 24 lines (1–4 each), $2,866.14, not 27. Order 1:
Basket A, $2,866.14, 19:06:27; eShop's checkout has no address form and ships to its hardcoded "123 Main St., Kent,
OH", so the Three Rivers address could not be used (an eShop limit). Order 2: 3 × Gift Card $0.01 = **$0.03** in
the basket, the order list and the order detail. "[ PAY NOW ]" sat under the HUD at the page end: #061, fixed
(and its follow-up, a ResizeObserver loop error, fixed). Fixed on the way: #056 (INSERT read as SET), #057 (HTTP 500
text).

### Act 5 — what does the basket page cost?

He loads `/Basket` with Basket A (27 lines) and reads its SQL.

**Done when:** Sid counts the SQL calls by hand, the count matches the dashboard,
and any repeated query shape is named by the dashboard's insight (or it says none).

**Outcome:** done. `/Basket` runs 3 SQL, all unique: basket + items JOIN, Catalog `IN OPENJSON`, and a `COALESCE SUM`
count. Hand count 3 = dashboard 3; no N+1, no insight. Slowest #1 0.49 ms. Emails in params read
`[redacted:email]`. Keyboard-only part: not checked in this act (see standing checks).

### Act 6 — the HUD on a Razor page

He turns the HUD on and reloads `/Basket`.

**Done when:** the HUD names the page, Server and DB add up to the calls it lists,
and each call opens its trace.

**Outcome:** done after #058, #059, #060. The HUD names `GET /Basket`; HUD and trace agree at 368 / 252 / 14 / 106 ms;
the call row opens its trace in a new tab. A trace opened at once from the HUD can show "Render –" until the
browser's page view arrives; Refresh fills it (not filed: the data arrives seconds later by design).

### Act 7 — one admin save

In the Blazor admin he edits product 1's price to 279.99 and saves.

**Done when:** one trace holds the browser fetch, PublicApi's PUT and its SQL; or
the run records exactly where the chain breaks.

**Outcome:** done after #063. First save (19:11, trace `c4d7e159…`): two half traces — the store's dashboard held only
`fetch /api/catalog-items`, the API's only the PUT and its SQL; nothing said so. Now the store's trace says where the
server part is and links to it; Sid added `TrustedRemotes = ["https://localhost:5099"]`, and the 19:17 save
(`a1b1f438…`) is one trace: fetch 136 ms → PUT 133 ms → Handler 104 ms → `SELECT Catalog` 43 ms, `UPDATE Catalog`
4.2 ms. Product 1 reads 279.99 in the admin. Also #064 (a duration label over the service dot), fixed.

### Act 8 — the mistake he has to undo

He deletes product 6 (the bear canister) from the admin while it is still in
Basket A and in Order 1, then opens his basket and his order history.

**Done when:** whatever eShop does (error or not) is visible in WizeLens with its
request, and Sid can tell from the dashboard which page broke and why.

**Outcome:** done after #065, #066, #067. The delete (`c937f8b5…`, one joined trace: fetch → DELETE → `DELETE Catalog`
17 ms) worked. Order 1 still lists its lines (eShop keeps copies). `/Basket` now answers 500
(`InvalidOperationException` at `BasketViewModelService.cs:60`: a basket line whose product is gone — an eShop bug,
left as is). Before the fixes WizeLens said only "HTTP 500" and the error page had no HUD. Now the HUD is on the error
page (red, 500, 1 Error), the trace's error is the exception with its stack, the title reads `pageview /Basket` 500,
and the SQL tab shows the Catalog query ran with `[523]` and returned nothing: page and cause, from the dashboard.

### Act 9 — logs for one checkout

He places Order 2 again and looks for its log lines.

**Done when:** the `ILogger` lines of that checkout are in Logs, in the trace's Logs
tab, and nothing secret is in them.

**Outcome:** done after #062. Order 2 again at 19:07:14: Logs → "Updating quantity" finds
`Services.BasketService · Updating quantity of item ID:26 to 3. · POST /Basket/Checkout`; the trace's Logs tab
(`2bf17f57…`) has the same line. Nothing secret in it. The category used to run over the message (#062, fixed). The
checkout POST shows 9 SQL with 2 "same query, same params" duplicates named.

### Act 10 — nothing secret

He signs up a second customer, `Zoë Nakamura-Ó Briain`, `p03.zoe@ashgrovepena.test`,
and reads every SQL param and log line of that sign-up.

**Done when:** no password hash, security stamp, token or email shows in clear
(emails as `[redacted:email]`), in the in-app dashboard and in the cloud.

**Outcome:** done after #068. eShop's register form asks for email and password only, so Zoë's name has no field
(eShop's form, not ours). Sign-up trace `06b4a6b3…` (in-app SQL tab): the email and the password hash were redacted,
but `@p12`, the SecurityStamp, was in clear: #068, fixed in all four SDKs. Re-proved with a password change (Identity
writes a new stamp): `UPDATE [AspNetUsers]` reads `@p11` `[redacted]`, hash `[redacted]`, both emails
`[redacted:email]`, in-app (`0d449743…`) and, after act 11, in the cloud (`7b96fb56…`). Log lines: "User created a new
account with password." and "User changed their password successfully." — nothing secret. The other side: Zoë's
order history (`13da9f66…`) is her own request: `enduser.id` names her and her buyer id param reads
`[redacted:email]`. `enduser.id` keeps the email by design (CONTRACT: Users groups by it); it is an attribute of
the request, not a SQL param or log line.

### Act 11 — send a copy to the cloud

He makes a cloud org `Ashgrove & Peña` and project `Ashgrove & Peña — Online Store`,
one ingest key per service, and points both services at it.

**Done when:** both services and the browser show on the cloud's Services page,
and act 7's trace link works in the cloud too.

**Outcome:** done after #069–#072. Site home → Cloud → "Start free" (points at app.wizelens.com; the local cloud on
:5970 stands in). "Create an account" → name, email, password → an empty Overview. Organization › General: renamed
to `Ashgrove & Peña`; Projects › Rename: `Ashgrove & Peña — Online Store`. Connect › Make a sending key, twice:
`eShop Web` and `eShop PublicApi`, Ingest, Never expires. Each went into its service's start as WIZELENS_HUB and
WIZELENS_HUB_TOKEN; both restarted. Services: Web App, Web, PublicApi and both SQL Server databases; "Sending to this
project (2 of 2 online)", .NET 8.0.33. Found and fixed on the way: no Web App → PublicApi line on the map (#069), the
endpoint table ran past its panel (#070), a Project column of dashes (#071). Act 7's admin save in the cloud
(`93fafe0b…`): fetch → PUT → SELECT + UPDATE, one trace. Share → 7 days → Create link; a signed-out browser opened it
and saw the same trace and SQL (the contractor's view). The product name there read `Pe\u00F1a … \u2014` (#072,
fixed in .NET and Python). Neighbours: Search for `Harrow & Vance`, `kanninja` and `hv_bookings` finds nothing;
Greta's board trace `391b74ba…` and the Harrow & Vance trace `82e5317a…`, by link and by Ctrl K, say "This trace is no
longer stored", the same as a trace that never existed. No leak.

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

- 10:20 Act 1. Home → ".NET" → `/dotnet/`: "Requires .NET 10 or newer." Filed #051; Brandon chose A (support .NET 8).
- 10:45 #051 built: net8.0 + net10.0 packages, 513 tests pass on each. The site and docs say 8, 9 and 10.
- 10:47 Act 2–3. eShop on .NET 8 with WizeLens from a local feed; the HUD on the home page (391 ms, 4 SQL);
  the dashboard at `/_wizelens`. Filed #052, #053 at 1440; fixed, re-proved in light, dark, 360.
- 10:56 Filed #054 (axis steps); fixed: 0, 50, 100, 150.
- 10:58 Requests: 202 rows, page 1 all files. Filed #055; fixed in .NET and Node; re-proved 11:04.
