# P05 — Marisol Teixeira-Wójcik · Kaweah Valley Credit Union, IT

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-28

**Status:** done
**Run:** 2026-10-28, 01:20–08:50 (America/Los_Angeles), Claude driving Chrome
**Role:** team admin · WizeLens Cloud: people, roles, SSO, SCIM, billing and limits

## Account

| Field | Value |
| --- | --- |
| Cloud email (owner) | `p05.marisol@kaweahvalleycu.test` |
| Password | `Lantern-Orchard-42!` (until SSO is on) |
| Cloud organization | `Kaweah Valley Credit Union — IT` |
| Projects | `Member Portal (staging)`, `Loan Desk API` |
| Identity provider | Keycloak, run locally in Docker, realm `kvcu` |
| Billing | Stripe **test mode**, with the test key Brandon provides; webhooks forwarded by the Stripe CLI |

Fill these in as soon as setup gives them to you.

## The person

Marisol Teixeira-Wójcik, 47, she/her. Head of IT at a credit union with 41 staff.
She does not write application code; she buys tools, sets them up for others,
signs the invoices, and answers the auditor.

**Technical level.** Medium-high in identity and networks (Active Directory, then
Keycloak), low in application code. Reads a SAML trace; has never read a flame chart.

**What she is nervous about.** The examiner. Every tool that touches member data
must have single sign-on, a way to remove a leaver the same day, and a record of
who did what. A tool where a contractor keeps access after leaving is a finding in
her report, with her name on it.

**What made her look today.** Her two developers asked for WizeLens. Her answer is
"yes, if it passes my checklist" — and she is the one running the checklist.

## The business

**Kaweah Valley Credit Union** — 41 staff, 18,600 members, two branches.

- The IT team uses WizeLens: 2 developers, 1 contractor, 1 auditor (read only), and
  Marisol. Five more people may join for a 3-month project
- Two projects: `Member Portal (staging)` and `Loan Desk API`
- Budget: Team plan approved; anything above $150 a month needs the board
- **Inconvenient for the software:** sign-in must be SSO-only once set up; a leaver
  is removed in Keycloak, not in WizeLens; the contractor may see one project only;
  the auditor must read everything and change nothing; Keycloak has no SCIM client
  built in (if WizeLens needs one, that is a finding to record, not to hide)

## Why she is here today

1. "Can I make SSO the only way in, and remove a leaver from one place?"
2. "Can I give a contractor one project and an auditor read-only, and prove it?"
3. "What will this cost each month, and what stops it costing more?"

## Setup answers

| Question | Answer |
| --- | --- |
| Plan | Team at first; Business only if a checklist item needs it — record which |
| SSO | OIDC from Keycloak realm `kvcu`, email domain `kaweahvalleycu.test` |
| Users | from Keycloak: SCIM if WizeLens and Keycloak can do it here, otherwise invites |
| Card | Stripe test card `4242 4242 4242 4242`; the declined test card for act 9 |

## The data

**This is the test data. Type it as written** (RULE #2).

### People (in Keycloak realm `kvcu`, and in WizeLens)

| Person | Email | WizeLens access |
| --- | --- | --- |
| `Marisol Teixeira-Wójcik` | `p05.marisol@kaweahvalleycu.test` | owner |
| `Dmitri Okonkwo-Halvorsen` | `p05.dmitri@kaweahvalleycu.test` | admin |
| `Aoife Ní Bhriain` | `p05.aoife@kaweahvalleycu.test` | member, both projects |
| `José-Luis Ferreira da Costa` (contractor) | `p05.joseluis@kaweahvalleycu.test` | member, `Loan Desk API` only |
| `Hannah Schmidt-Yamamoto` (auditor) | `p05.hannah@kaweahvalleycu.test` | viewer, everything |
| `Priya Venkataraman-O'Neill` (leaver, act 7) | `p05.priya@kaweahvalleycu.test` | member, then removed |

The five 3-month project people are numbered `p05.temp01` … `p05.temp05` with real
names: `Tomás Ruiz`, `Ngozi Eze`, `Lars Øberg`, `Mei-Lin Chau`, `Ömer Yılmaz`.

### Telemetry

Both projects need real data for the auditor to read. For the length of the run,
the kanNINJA API (P01's) sends with a second ingest key from this org, named
`Loan Desk API — staging key (expires 2026-12-31)`, standing in for the loan desk.

---

## The setup she leaves with

**This list is the definition of done** (RULE #8).

| Item | What it must have |
| --- | --- |
| A paid plan | the plan she chose, bought through Stripe's checkout in test mode, with the invoice visible |
| SSO-only sign-in | everyone at `kaweahvalleycu.test` signs in through Keycloak; password sign-in refused for them |
| One place to remove a leaver | Priya disabled in Keycloak loses WizeLens access, and the time it took is recorded |
| Least access, proved | José-Luis sees only `Loan Desk API`; Hannah reads everything and every change button refuses her |
| A spend limit | a cap set, the projected bill read, and what happens at the cap stated by the screen |
| An audit trail | every change above in the audit log, exported for the examiner |

**Working end to end:** the examiner reads the export and Hannah's view and can
answer "who could see member data, and since when" without asking Marisol.

**The look.** Unlike P01–P04: no code and no traces of her own — settings, people,
money and proof.

**Also required:** both themes, 360px, keyboard only for one full job.

---

## The run

### Act 1 — the checklist, before signing up

From http://localhost:5190/ she reads Pricing, Security and the SSO docs.

**Done when:** she knows which plan has SSO, SCIM and audit export, and what a month
costs for her team, from the site alone.

**Outcome:** done after #117. From http://localhost:5190/ she read Pricing, Security and the SSO docs. Pricing names Business as the plan with single sign-on, SCIM and audit export, at $99 a month with 150 GB included; Team at $29 has none of the three. She knew the month's cost before she signed up.

### Act 2 — sign up and buy the plan

She creates the org and both projects and buys the plan with the test card.

**Done when:** the plan shows as active, Stripe's checkout ran, and the invoice is
reachable from the billing screen.

**Outcome:** done after #124 and #125. She made the org and both projects, chose Business and paid with 4242 on Stripe Checkout. A double-click on Buy made one customer and one plan subscription (plus the extra-data one). The plan was active in the same second Stripe's checkout ended (01:41:15). The invoice opens from Billing › Manage billing. #124: Stripe lists two subscriptions and WizeLens now says why. #125: an upgrade now gives the plan's 90 days at once.

### Act 3 — single sign-on from Keycloak

She sets up OIDC from realm `kvcu` and signs in through it.

**Done when:** Dmitri signs in through Keycloak for the first time and lands in the
org with the right role.

**Outcome:** done. Domain proven 02:00 ("Domain proven"). Dmitri signed in through Keycloak, was made Admin, and kept it after a reload. Nit kept: a role change shows no "saved" line.

### Act 4 — make SSO the only way in

She turns off password sign-in for her domain.

**Done when:** a password sign-in for `p05.aoife@…` is refused with a sentence that
tells Aoife what to do, and Marisol still has a way back in if Keycloak is down.

**Outcome:** done after #117. "Require single sign-on" signed out 2 people; password, reset and sign-up for kaweahvalleycu.test are refused with one clear sentence; the owner keeps a password and two-step sign-in for when the provider is down.

### Act 5 — people, from Keycloak

She brings the team in: SCIM if the two can do it, otherwise invites.

**Done when:** all six people and the five temps are in the org with the access in
the table; or the run records exactly why SCIM could not be used.

**Outcome:** done after #126, #127 and #128, with SCIM not run: Keycloak has no SCIM client without a plugin. 8 people invited by CSV, all joined with SSO + Join (02:18–02:22). José-Luis set to No access on Member Portal (staging). Keys: Member Portal staging server (never ends); Loan Desk API staging key ending Dec 31, 2026; the old never-ending key revoked 02:35. Stand-in apps in `G:/code/@wizeworks/persona-apps/kvcu-apps` replace kanNINJA, so P02's key is not touched.

### Act 6 — least access, proved

As José-Luis and as Hannah, she checks what each can see and do.

**Done when:** José-Luis cannot open `Member Portal (staging)` by link, search or
key; Hannah reads every page and every change she tries is refused.

**Outcome:** done after #129 and #130. José-Luis sees only Loan Desk API; a Member Portal link shows his own project with a note (#129); a portal trace link says "This request is not in this project, or it is no longer stored"; searches for `thanh.nguyen`, `/api/members` and `member-portal` find 0; Connect says "Ask an owner or admin". Hannah opened 28 pages and read all of them; after #130 she sees no change buttons. OAuth MCP for José-Luis not checked.

### Act 7 — the leaver

Priya leaves at 16:45. Marisol disables her in Keycloak.

**Done when:** Priya's open session and her next sign-in both stop working, the time
until her access ended is recorded, and her keys (if any) are named in a list.

**Outcome:** done after #131 (blocker). Priya disabled in Keycloak 02:45:52; before #131 her open tab kept working for up to 14 days. With the fix: disabled 02:52:54, tab still worked 02:56:16, sign-in page 02:56:40, about 3 min 45 s (5 min at most). Next sign-in: Keycloak "Account is disabled". Audit: "Signed out: the identity provider ended their sign-in". Marisol removed her at 02:59. Dmitri stayed signed in through the 03:01 check.

### Act 8 — the bill and the cap

She reads usage, the projected bill, and sets a spend cap of $150.

**Done when:** her own projection by hand matches the screen, and the screen says what
happens at the cap.

**Outcome:** done after #132 and #133. Billing shows MB used, the projection, and each coming charge with its date: 13 MB projected (by hand 13.2 MB), extra data $0 on Nov 1, Business $99 on Nov 28. A $150 cap saved with "Saved. Extra data stops at $150 a month; after that new data is refused until the 1st." and kept after reload.

### Act 9 — the card is declined

The card on file is switched to Stripe's declined test card and the renewal runs.

**Done when:** the screen tells her the payment failed, what still works, and what to
do, and she fixes it with the good card.

**Outcome:** done after #134. Card 4000 0000 0000 0341 declined; plan past_due at 03:09:21. Owners and admins now see a banner on every page with "Update the card"; Hannah (viewer) does not. Marisol fixed it in the portal with Pay failed amount (4242) at 03:12; the banner went at 03:13.

### Act 10 — the 3-month project ends

She removes the five temps at once and downgrades if Business was needed only for them.

**Done when:** the five are gone, the plan changes as she chose, and nothing she still
needs (SSO, the audit log) silently stops.

**Outcome:** done after #135 (blocker) and #136. Bulk Remove of 5 temps at 03:15:15. Before #135, Ngozi came back with every project after one SSO sign-in; now Ngozi, Lars and Mei-Lin are refused with an audit row, and Hannah still signs in. Switch to Team now lists what she loses (30 days, SSO lock, SCIM, export) and opens Stripe's confirm page; she left it and kept Business. Nit kept: bulk Remove shows no "Removed 5" line.

### Act 11 — the examiner's export

She exports the audit log and reads it as the examiner.

**Done when:** every change from acts 2–10 is in it with who and when, in her timezone
or clearly UTC.

**Outcome:** done after #137 and #138. Export CSV holds every change of acts 2–10 with UTC time, and names people by name and email, former members too. Hannah, the auditor, reads and exports it herself (#138, by the product owner's decision). The card decline of act 9 is in Stripe's record, not the audit log.

---

## What only this persona proves

The conditions: real billing through Stripe test mode, SSO-only sign-in from a real
identity provider, offboarding from one place, least access proved from both sides,
spend limits, and an audit trail an examiner can use.

---

## Standing checks

**Wrong moves.** Marisol demotes herself, the last owner. She double-clicks "Buy".
She removes Aoife instead of Priya, then has to undo it.

**Reload and deep link.** F5 during Stripe checkout and after returning from it; open
an invite link after it was revoked; open a deep link to `Member Portal (staging)`
as José-Luis.

**Dates.** Priya leaves at 16:45 machine time; read the audit log time for it. The
plan renewal date crosses 2026-11-01 (DST ends) — check the date on the invoice.

**Numbers at the edges.** Projected bill by hand from GB used and the plan's included
GB and tiers; compare with the screen.

**The other side.** Hannah, the auditor, signs in through SSO and reads the export.

**Without a mouse.** Act 6 as Hannah, keyboard only.

**Somebody else's data.** Search for `Haddad`, `Ashgrove`, `Harrow & Vance` and
`kanninja`; paste a P02 project id; try José-Luis's key on a project it does not hold.

**Results (2026-10-28):**

- Wrong moves: demoting herself is refused ("You cannot leave the organization without an owner"), still Owner after
  reload. Double-click on Buy: one subscription. Aoife removed by mistake at 03:38, invited again, joined 03:39 from the
  link; the audit log shows Removed, Invited, Joined; her next SSO sign-in works.
- Reload and deep link: a cancelled invite link says "This invite link is not valid any more. Ask your team for a new
  one." José-Luis's portal link: #129. F5 during Stripe Checkout: not checked.
- Dates: the audit log shows Priya's sign-out in machine time; the renewal reads Nov 28, 2026 on Billing and on
  Stripe's confirm page, across the Nov 1 change.
- Numbers: projection 13.2 MB by hand, 13 MB on screen (#132).
- The other side: Hannah reads and exports the audit log (#138).
- Without a mouse: Hannah reaches the audit log and exports it by keyboard only; the focus ring shows at every stop.
- Somebody else's data: `Haddad`, `Ashgrove`, `Harrow & Vance`, `kanninja` find 0 in Kaweah's org; Greta's project
  link opens José-Luis's own data with a note. José-Luis has no key (members make none), so the key check was not possible.

---

## Verification

Filled in at the end, honestly, **including what was skipped** (RULE #4).

| | Result |
| --- | --- |
| Acts completed | 11 of 11 |
| Issues filed | 16: #117, #124–#138 |
| Issues fixed and confirmed | all 16; #131 and #135 were blockers |
| Issues blocked, and on what | none |
| Screens scored | Billing, Single sign-on, Audit log (light and dark at 1440, dark at 360) |
| **Not checked** | SCIM (Keycloak has no SCIM client); OAuth MCP for José-Luis; F5 during Stripe Checkout; Invite page and "No organization yet" in dark and at 360 |

### The numbers

| Record | Result |
| --- | --- |
| Minutes from "Buy" to an active plan | under 1: active in the same second checkout ended (01:41:15); time on Stripe's form not timed |
| Minutes from Priya disabled in Keycloak to access gone | about 3 min 45 s (02:52:54 to 02:56:40); 5 min at most |
| Projected bill (hand vs. screen) | 13.2 MB vs. 13 MB; $0 extra, $99 plan, both match |

---

## Run log

- 01:20–01:41 acts 1 and 2: Business bought; #124, #125 fixed
- 01:55–02:08 acts 3 and 4: domain proven, Dmitri Admin, SSO required; #117 fixed
- 02:15–02:36 act 5: 8 people by CSV, keys; #126–#128 fixed
- 02:37–02:44 act 6: José-Luis and Hannah; #129, #130 fixed (Greta re-checked #130)
- 02:45–03:01 act 7: Priya; #131 fixed and timed
- 03:02–03:05 act 8: #132, #133 fixed
- 03:08–03:13 act 9: declined card; #134 fixed
- 03:15–03:31 act 10: #135, #136 fixed
- 03:34–03:36 act 11: #137 fixed
- 03:37–03:42 standing checks: wrong moves, revoked link, other customers' names
- 08:40–08:50 Hannah by keyboard; #138 decided by the product owner and fixed; scores in rating.md; Status done
