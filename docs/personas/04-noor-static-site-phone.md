# P04 — Noor Haddad-Pellegrini · a client's marketing site, from her phone

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-27

**Status:** in progress
**Run:** 2026-10-27, from 21:00 (America/Los_Angeles, UTC-7), Claude driving Chrome in phone emulation (390 × 844, touch) unless an act says otherwise
**Role:** front-end only · the browser script tag, no server SDK · WizeLens Cloud on a phone

## Account

| Field | Value |
| --- | --- |
| Cloud email | `p04.noor@haddadstudio.test` |
| Password | `Lantern-Orchard-42!` |
| Cloud organization | `Haddad Studio — Client Sites` |
| Project | `Brandon K. — personal site (Vite)` |
| The site | a copy of `G:/code/personal-type` in `G:/code/@wizeworks/persona-apps/personal-type`, built and served at http://localhost:4173 |

Fill these in as soon as sign-up gives them to you.

## The person

Noor Haddad-Pellegrini, 29, she/her. A freelance web designer. She builds
marketing sites with Lovable and Vite and hands them to clients. Most of her day is
in client meetings and on trains, so she checks things **on her phone**.

**Technical level.** Medium. Writes HTML, CSS and some React; has never written a
server, never read a SQL query, and does not know what a "span" is. Uses Google
Analytics and Vercel's speed panel.

**What she is nervous about.** Looking like she does not know her job in front of
a client. If a tool shows her a wall of server words she cannot explain, she will
not show it to anyone.

**What made her look today.** Her client texted "the site is slow on my phone and
the contact page did something weird". She has no server to look at — the site is
static files — and she searched "see errors and speed on a static site".

## The business

**Haddad Studio** — one person, 14 client sites, all static (Vite builds on a CDN).

- This client's site: 12 pages (home, about, services, resume, blog, a blog post,
  contact, accessibility, privacy, terms, sitemap, 404), about 2,300 visits a month,
  71% of them on phones
- No backend: the contact form opens the visitor's mail app; nothing is stored
- **Inconvenient for the software:** there are **no servers, no SQL and no
  traces with a backend** — only browsers. Every screen that assumes a server must
  still make sense to her, or say plainly that it does not apply. She works from a
  phone, with her thumbs, on a 390 px screen.

## Why she is here today

1. "Which page is slow on a phone, and why, in words I can repeat to my client?"
2. "What broke on the contact page, and on which phone?"
3. "Tell me when the site is down, before the client does."

## Setup answers

| Question | Answer |
| --- | --- |
| Stack picked on the site | whatever the site offers for a static site or a plain script tag — record what it offers |
| Install | one `<script>` tag in `index.html`; no npm package |
| Key | a browser key (public); she must never put a secret key in the page |
| HUD | on, for her own visits only, if the docs say a script-tag site can have it |

## The data

**This is the test data. Type it as written** (RULE #2).

| Field | Value |
| --- | --- |
| Organization | `Haddad Studio — Client Sites` |
| Project | `Brandon K. — personal site (Vite)` |
| Browser key name | `brandonk.dev — public site (script tag)` |
| Uptime check | `Home page — every 1 min` on `http://localhost:4173/`, expect 200 and the body text `Brandon` |
| Uptime check 2 | `Contact page — São Paulo client's favourite` on `http://localhost:4173/contact` |
| Alert | `Site down → Noor's phone (email)` to `p04.noor@haddadstudio.test` |
| Visits | at least 26 page views over all 12 pages, from 3 device sizes (390 px phone, 768 px tablet, 1440 px desktop), so lists of pages and devices page or scroll |
| A shared link | a read-only link to the slowest page's view, for the client `Rémy Okafor-Lindgren` |

---

## The setup she leaves with

**This list is the definition of done** (RULE #8).

| Item | What it must have |
| --- | --- |
| The script tag, live | one tag in `index.html`, with a browser key, sending page views, vitals and errors from every page |
| The slow page, named | the slowest page on phones, with the number and the reason in words she can repeat |
| The contact page error, found | the error from act 6 with the page, the browser, the phone, and the line in her own source |
| Uptime and an alert | both checks running; the alert fired once when the site stopped, and its email is in the cloud log |
| A link for the client | the read-only link opens on Rémy's phone without an account |
| Nothing server-shaped left confusing | every page she opened either shows her data or says plainly that it needs a server SDK |

**Working end to end:** Rémy opens Noor's link on his phone and understands it
without her on the call.

**The look.** Unlike P01–P03: no servers at all, a phone first, and a person who
does not read code.

**Also required:** both themes, 390 px and 360 px, and one full job done with
thumbs only (no hover, no keyboard).

---

## The run

### Act 1 — find the static-site instructions, on her phone

From http://localhost:5190/ at 390 px, she looks for how to add WizeLens to a
site with no server.

**Done when:** she has the exact script tag and knows which key to put in it, from
the site, without opening a server SDK page.

**Outcome:** —

### Act 2 — sign up and make a browser key, on her phone

She creates a cloud account, the org and the project, and a browser key.

**Done when:** the key exists with her name for it, and the screen told her plainly
that this key is safe to put in a public page.

**Outcome:** —

### Act 3 — the wrong key first

She pastes the **ingest** (secret) key into the script tag by mistake, builds, and
opens the site.

**Done when:** WizeLens refuses it or warns her in words she understands, and she
learns which key belongs in a page. Record exactly what she saw, and where.

**Outcome:** —

### Act 4 — the right key, and the first visits

She swaps in the browser key, builds, serves the site, and visits all 12 pages from
three sizes.

**Done when:** the cloud shows her page views by page and by device, and the
minutes from the script tag to the first page view are recorded.

**Outcome:** —

### Act 5 — which page is slow on a phone?

She looks for the slowest page on phones and why.

**Done when:** she can name the page, the number, and the reason in one sentence
she would say to Rémy, without opening a word she does not know.

**Outcome:** —

### Act 6 — what broke on the contact page?

A broken line is put into the contact page (as the client's nephew did), the site is
rebuilt, and she visits it from the phone.

**Done when:** the error is in Errors with the page, the browser and the phone, and
she can see the line in her own source (or the screen tells her what to upload to
see it).

**Outcome:** —

### Act 7 — the screens that assume a server

She opens Overview, Requests, Traces, Database, Services and Logs.

**Done when:** each one shows her browser data or says plainly that it needs a server
SDK, with a link to how. Nothing reads as broken or empty without a reason.

**Outcome:** —

### Act 8 — tell me when it is down

She adds both uptime checks and the alert, then the site is stopped for 3 minutes.

**Done when:** the checks go red, the alert fires, its email is in the cloud log,
and both recover when the site is back.

**Outcome:** —

### Act 9 — the HUD on her own phone

She turns on the HUD for her own visits and opens the home page.

**Done when:** the HUD fits a 390 px screen, says what the page cost, and can be
moved or closed with a thumb; or the docs say a script-tag site has no HUD.

**Outcome:** —

### Act 10 — a link for the client

She makes a read-only link to the slow page's view and sends it to Rémy.

**Done when:** the link opens on a phone, signed out, shows only that view, and
cannot be used to see anything else in her org.

**Outcome:** —

---

## What only this persona proves

The negative space: WizeLens with no server at all — the script tag, a browser key,
a person who does not read code, and every screen used on a phone with thumbs.

---

## Standing checks

**Wrong moves.** The secret key in the public page (act 3). Delete the browser key
the live site uses, then make a new one — what does the site do in between, and
what does the cloud say? Add the same uptime check twice.

**Reload and deep link.** Pull-to-refresh on Errors; open the shared link in a new
private window; open a deep link to one error while signed out, then sign in.

**Dates.** The uptime outage times against the phone's clock (America/Los_Angeles);
"last seen" of a page visited at 23:58.

**Numbers at the edges.** Count her own page views by hand (26+) and compare with
the cloud's total; compute the share of phone visits by hand and compare.

**The other side.** Rémy on the shared link (act 10).

**Without a mouse.** Acts 8–10 with thumbs only: every control reachable, no hover
needed, tap targets at least 44 px.

**Somebody else's data.** Search the cloud for `kanninja`, `Harrow & Vance` and
`Ashgrove`; paste a P02 trace id and a P02 project id into her address bar. Expect
nothing.

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
| Minutes from the script tag to the first page view | — |
| Page views (hand vs. screen) | — |
| Phone share (hand vs. screen) | — |

---

## Run log
