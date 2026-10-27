# P05 — Marisol Teixeira-Wójcik · Kaweah Valley Credit Union, IT

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-27

**Status:** not started
**Run:** — (America/Los_Angeles), Claude driving Chrome
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

**Outcome:** —

### Act 2 — sign up and buy the plan

She creates the org and both projects and buys the plan with the test card.

**Done when:** the plan shows as active, Stripe's checkout ran, and the invoice is
reachable from the billing screen.

**Outcome:** —

### Act 3 — single sign-on from Keycloak

She sets up OIDC from realm `kvcu` and signs in through it.

**Done when:** Dmitri signs in through Keycloak for the first time and lands in the
org with the right role.

**Outcome:** —

### Act 4 — make SSO the only way in

She turns off password sign-in for her domain.

**Done when:** a password sign-in for `p05.aoife@…` is refused with a sentence that
tells Aoife what to do, and Marisol still has a way back in if Keycloak is down.

**Outcome:** —

### Act 5 — people, from Keycloak

She brings the team in: SCIM if the two can do it, otherwise invites.

**Done when:** all six people and the five temps are in the org with the access in
the table; or the run records exactly why SCIM could not be used.

**Outcome:** —

### Act 6 — least access, proved

As José-Luis and as Hannah, she checks what each can see and do.

**Done when:** José-Luis cannot open `Member Portal (staging)` by link, search or
key; Hannah reads every page and every change she tries is refused.

**Outcome:** —

### Act 7 — the leaver

Priya leaves at 16:45. Marisol disables her in Keycloak.

**Done when:** Priya's open session and her next sign-in both stop working, the time
until her access ended is recorded, and her keys (if any) are named in a list.

**Outcome:** —

### Act 8 — the bill and the cap

She reads usage, the projected bill, and sets a spend cap of $150.

**Done when:** her own projection by hand matches the screen, and the screen says what
happens at the cap.

**Outcome:** —

### Act 9 — the card is declined

The card on file is switched to Stripe's declined test card and the renewal runs.

**Done when:** the screen tells her the payment failed, what still works, and what to
do, and she fixes it with the good card.

**Outcome:** —

### Act 10 — the 3-month project ends

She removes the five temps at once and downgrades if Business was needed only for them.

**Done when:** the five are gone, the plan changes as she chose, and nothing she still
needs (SSO, the audit log) silently stops.

**Outcome:** —

### Act 11 — the examiner's export

She exports the audit log and reads it as the examiner.

**Done when:** every change from acts 2–10 is in it with who and when, in her timezone
or clearly UTC.

**Outcome:** —

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
| Minutes from "Buy" to an active plan | — |
| Minutes from Priya disabled in Keycloak to access gone | — |
| Projected bill (hand vs. screen) | — |

---

## Run log
