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

**Outcome:** done after #080 and #081. From the home page at 390 px: Menu → Platforms → **Static sites** ("One script tag, no server") opens Docs › Browser › Static sites. The script tag is first, "before `</body>`", then the words she needs: the browser key (`wl_bk_`) is public; never put an ingest key (`wl_ik_`) in a page. The quick start now says "No server?" before step 1 and links there. No server SDK page opened. Before #080 the menu and the quick start had no static path at all; before #081 the Copy button covered the first line of the tag on a phone.

### Act 2 — sign up and make a browser key, on her phone

She creates a cloud account, the org and the project, and a browser key.

**Done when:** the key exists with her name for it, and the screen told her plainly
that this key is safe to put in a public page.

**Outcome:** done after #082 and #083. Sign-up on the phone took four fields and went straight to an empty Overview, with an organization "Noor Haddad-Pellegrini's team" and a project "My app" made for her. The Overview now says "Nothing has arrived in this range. New here? … Setup steps" (#082); before, it showed only zeros and Connect was two taps away under More. Renamed under More › Organization: the org to `Haddad Studio — Client Sites` ("Saved.") and the project to `Brandon K. — personal site (Vite)` (Rename dialog: "Keys, data, alerts, and links stay as they are."). Connect › Sending keys › New sending key › **Browser: a site with no WizeLens server sends page data**, name `brandonk.dev — public site (script tag)`, Sites `http://localhost:4173`. The box says "It is public: it is safe in a page. Put this tag in every page, before </body>:" and gives the whole tag with her key and this cloud's address (#083; before, it gave `endpoint={cloudEndpoint(key)}` code words and no `src`). Two keys made before #083 were revoked from the list. Also made, from Setup steps with the default kind, the ingest key `brandonk.dev — first try`, for act 3.

### Act 3 — the wrong key first

She pastes the **ingest** (secret) key into the script tag by mistake, builds, and
opens the site.

**Done when:** WizeLens refuses it or warns her in words she understands, and she
learns which key belongs in a page. Record exactly what she saw, and where.

**Outcome:** done after #084. With the ingest key in the tag, the site opened normally and nothing arrived. Before #084 the cloud answered the page with a bare 405 and said nothing anywhere: no line on the key, no email, an Overview that only said nothing had arrived. Now the cloud refuses it with "This is a secret key: it must never be in a page. Rotate it, and send from pages with a browser key (wl_bk_)." (in the browser console), Connect › Sending keys shows a red box and a **Seen in a page** badge on `brandonk.dev — first try`, and the team got the email "WizeLens saw the secret key brandonk.dev — first try in a public page on http://localhost:4173 and refused its data. Rotate it now, and put a browser key in pages." (in the cloud log). She rotated it from the row; the dialog said the old secret stops at once because it was in a public page, and the badge went away. What she learned, in the screen's words: secret keys never go in a page; pages use a browser key.

### Act 4 — the right key, and the first visits

She swaps in the browser key, builds, serves the site, and visits all 12 pages from
three sizes.

**Done when:** the cloud shows her page views by page and by device, and the
minutes from the script tag to the first page view are recorded.

**Outcome:** done after #085–#089. The browser key went into the tag at 21:25:42; the first visits were at about 21:26 and showed in the cloud at once: about 1 minute from the tag to the first page view. Visits: 12 pages on the phone (390 px), 8 on the tablet (768 px), 8 on the desktop, then 1 and 2 more on the phone, and after #087 the same 12 / 8 / 8 again: 59 by hand, and Overview says "59 page views arrived" (#085: before, it said nothing had arrived). Rendering lists the 13 routes (12 pages and the 404). Its first-byte card was "SSR", a server word for a static site (#086: now "Server Response"). **By device** (#087, new) says Phone 282 ms (12) · Tablet 301 ms (8) · Desktop 434 ms (8): only the 28 visits made with this branch's browser script carry a device, because the published CDN script (0.3.0-alpha.13) is older than the user agent on page views (see #087). On her phone, Rendering was drawn 1160 px wide with three of the five bottom tabs off the screen (#088); the RULE #7 check on Greta then found a service chip pushing her account button off the screen (#089). Both fixed.

### Act 5 — which page is slow on a phone?

She looks for the slowest page on phones and why.

**Done when:** she can name the page, the number, and the reason in one sentence
she would say to Rémy, without opening a word she does not know.

**Outcome:** done after #090–#092. Rémy's phone was played by 18 visits on slow 4G with a 4× slower CPU (12 pages, then 6 again), all 18 arrived (77 in all). Rendering › By device, phones first by time: `/blog/future-of-devsecops-from-pipelines-to-platforms`, Phone 6.14 s (tablet 640 ms, desktop 1.20 s). Tapping it opened the route page, which mixed all devices into "Avg Render Time 1.71 s" and gave no reason (#090). Now its **On each device** card says Very slow, ready in 6.14 s, and: "The text shows at 1.56 s, but the main content shows only at 6.14 s. Its pictures hold it up: the slowest took 4.54 s to download. 1 picture is bigger than the screen needs." Its newest page load said TOTAL 1.56 s and "No problems found" (#091: now 6.14 s and a **Slow page** problem), and on the phone that screen was 714 px wide once the problem showed (#092). Her sentence for Rémy: "On a phone the DevSecOps blog post takes about 6 seconds: the words show in a second and a half, but its big picture takes four and a half seconds to download, and it is bigger than a phone needs." Words she did not know: none on the route page; the trace page still says "Spans" and "pageview".

### Act 6 — what broke on the contact page?

A broken line is put into the contact page (as the client's nephew did), the site is
rebuilt, and she visits it from the phone.

**Done when:** the error is in Errors with the page, the browser and the phone, and
she can see the line in her own source (or the screen tells her what to upload to
see it).

**Outcome:** done after #093–#096. The nephew's line: the "Message sent" greeting reads the visitor's second name, `formData.name.split(" ")[1].trim()`. Rémy (phone, slow 4G) typed only "Rémy": the button stayed on "Sending…" for good and the page threw "Cannot read properties of undefined (reading 'trim')". Errors on her phone listed it on `/contact`; its page said Browsers "Chrome on Android" (#094: now "Chrome on Android (phone)"). The stack was `index-CBBz6Uwe.js:226:34855` with "No source map found" and no next step (#095: now a box says what a source map is and what to add, with the docs link). The error also brought two requests her site never made, the script reading its own map (#093), so Errors said "Error Rate 0%". She followed the box: a new ingest key `brandonk.dev — source maps (build)` in Connect › Sending keys, `npm install -D @wizeworks/lens-cli`, `wizelensSourceMaps()` in vite.config.ts, version 1.0.1; the build uploaded the map and left it in `dist` to be deployed (#096: now deleted after upload). Rémy's next try showed `src/pages/Contact.tsx:33:59` with the line itself. She fixed it (`formData.name.trim().split(" ")[0]`), built 1.0.2, Rémy's form said "Message sent!", and she resolved both error groups from the phone.

### Act 7 — the screens that assume a server

She opens Overview, Requests, Traces, Database, Services and Logs.

**Done when:** each one shows her browser data or says plainly that it needs a server
SDK, with a link to how. Nothing reads as broken or empty without a reason.

**Outcome:** done after #097 and #098. On her phone (390, last 15 min, 3 page views): Overview already said "3 page views arrived, and no server requests…"; Requests, Database, and Services showed only "No data" cards (#097: each now says what arrived, what it is missing, "To add one: Setup steps", and where her pages are). Traces lists her page loads (each a trace with its paint and image timing); Logs lists the browser errors her pages send, and "No log lines in this time range" when there are none. No screen was wider than 390. On the way: the red Errors badge still said 2 after she resolved both groups (#098: it counts open groups only, in the chosen service and period; re-proved on Greta, 8 → 2, matching her Errors page).

### Act 8 — tell me when it is down

She adds both uptime checks and the alert, then the site is stopped for 3 minutes.

**Done when:** the checks go red, the alert fires, its email is in the cloud log,
and both recover when the site is back.

**Outcome:** done after #099–#102. On her phone she added `Home page — every 1 min` (expects `Brandon`) and `Contact page — São Paulo client's favourite`, then the home check again: it saved a twin with no word (#100: now "already checks GET http://localhost:4173/. Edit that check, or give this one another name."). The home check went Down with the site up: her name is written by JavaScript, and the reason did not say so (#099: now it does, and points at the page title); she changed the text to `BK Personal Brand` and it went Up. There was no alert for a site being down at all (#101): Uptime now has **Alert me when one fails**, which opened New alert on "Uptime checks failing" above 0 over 5 minutes; she named it `Site down → Noor's phone (email)` and ticked herself. First outage 22:59:56–23:02:48: both checks Down, incidents of 2 min, but the alert had already fired at 22:58 on the fixed "Brandon" failure (#101, second part: now each check's newest run) and its email said "2026-10-28 05:59 UTC" (#102: now her own zone, saved from her browser). Second outage 23:08:43–23:11:11: incidents at 11:08 PM for 3 min; Firing at 23:09, "Uptime checks failing is 2 (above 0)", email "When: Oct 27, 2026, 11:09 PM PDT"; Resolved at 23:12 with its email. Mail is not set up on this cloud, so both emails are in the cloud log, and the Alerts list says "email: mail is not set up (see the cloud log)".

### Act 9 — the HUD on her own phone

She turns on the HUD for her own visits and opens the home page.

**Done when:** the HUD fits a 390 px screen, says what the page cost, and can be
moved or closed with a thumb; or the docs say a script-tag site has no HUD.

**Outcome:** done after #103. Her tag from Connect had `data-hud="false"`, and "auto" never shows the HUD with a browser key; the only way in was `data-hud="true"`, which shows it to every visitor of her portfolio. Now she opens `http://localhost:4173/?wizelens-hud=on` once: at 23:26 the HUD on her 390 px phone (4G) read "1,372 ms Total … 1,367 ms Render", 358 px wide; /services showed it with no switch in the address; a visitor's browser had none; `?wizelens-hud=off` hid it. By thumb: its buttons were 28 px and are now 44 px on touch; Settings › "Show WizeLens bottom left", Minimize (a 46 px dot) and open again all worked at 390 and 360; "Open the dashboard" went to the send address (blank) and now opens the cloud. Server and Database say "No server data for this request." on a site with no server. Rule 7: Greta made a browser key on Connect at 23:36, read the new tag (no `data-hud`) and the HUD note, and revoked it.

### Act 10 — a link for the client

She makes a read-only link to the slow page's view and sends it to Rémy.

**Done when:** the link opens on a phone, signed out, shows only that view, and
cannot be used to see anything else in her org.

**Outcome:** done after #104–#107. Looking for the slow page, Rendering on the last hour was empty and told her to paste React code with `endpoint="/_wizelens"`, which sends nothing to the cloud (#104: now it names the browser key's tag and links to Setup steps). In Rendering › By device (24 h) she tapped `/blog/future-of-devsecops-from-pipelines-to-platforms` (Phone 6.14 s, "Very slow"), then Share this page: the box opened half off the screen (#105: all five top-bar menus that did so now span the bar at 390 and 360). She picked For 7 days and Make a link, and copied it. Rémy opened it on his phone with no account, in a fresh browser: the route's view, "On each device" with the phone at 6.14 s and the reason, and the header "as of Oct 27, 2026, 11:56 PM · link works until Nov 3, 2026", but titled "WizeLens", not her site (#106: now "Brandon K. — personal site (Vite) · …"). Its "All routes" link, like the action links on any shared page, led to a sign-in form (#107: now no link leaves a shared page). From the same browser, `#/errors`, `#/overview?org=<her org>` and `#/rendering` each showed "Sign in to WizeLens" and nothing of hers. Rule 7: Greta's menus (390 and 1440), her shared Errors link, and her signed-in links were re-checked.

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
| Minutes from the script tag to the first page view | about 1 (tag 21:25:42, first visits about 21:26) |
| Page views (hand vs. screen) | 59 vs. 59 (Overview) |
| Phone share (hand vs. screen) | 27 of 59 = 46% of all visits; the screen counts devices only on the 28 visits whose script sent the browser: 12 of 28 = 43%, and 12 by hand |

---

## Run log

- 21:00 act 1 at 390 px from the site home page; #080 (no static path in the menu or quick start) fixed 21:01
- 21:03 #081 (Copy button over the code on a phone) fixed
- about 21:04 signed up as p04.noor@haddadstudio.test on the phone; #082 (empty Overview, no way to start) fixed 21:06
- 21:08–21:14 org and project renamed; browser and ingest keys made; #083 (no ready script tag) fixed 21:14; two spare browser keys revoked
- 21:15 act 3: the ingest key in the tag, refused without a word; #084 fixed 21:25; key rotated
- 21:25:42 act 4: the browser key in the tag; 29 page views from 3 sizes by 21:28; #085 (Overview said nothing arrived) fixed 21:30; #086 (SSR on a static site) fixed 21:34
- 21:55–21:58 act 5: 18 visits as a slow phone (slow 4G, CPU ×4)
- 21:59–22:16 #090 (no reason, no device on a page's screen), #091 (Total 1.56 s for a 6.14 s load), #092 (trace 714 px wide on a phone) fixed; #089 again at 360
- 22:18 act 6: the broken line built in; Rémy's form fails on the phone; #093–#095 fixed 22:26
- 22:47–23:13 act 8: two checks, one alert, two outages; #099–#102 fixed and confirmed
- 23:14–23:36 act 9: HUD for her own browser only; #103 fixed and confirmed (Greta re-checked Connect's tag)
- 23:37–00:02 act 10 (a restart of the machine at about 23:47 stopped the cloud and the site; both started again, no data lost): link for Rémy; #104–#107 fixed and confirmed
- 22:33–22:45 act 7: #097 and #098 fixed and confirmed (Greta re-checked for #098)
- 22:27–22:33 build key made; plugin added; #096 fixed 22:29; source line shown 22:30; line fixed, 1.0.2 built, errors resolved
- 21:36–21:53 #087 (no split by device) fixed; 28 more visits with this branch's script at 21:44; #088 (Rendering 1160 px wide on a phone) and #089 (service chip pushes the account button off, found on P02) fixed 21:53
