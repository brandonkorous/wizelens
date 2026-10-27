# CLAUDE.md — WizeLens persona testing

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-10-26

Binding for anything under `docs/personas/`. Where it is silent, the repo's root
`CLAUDE.md` applies.

This folder is not documentation about testing. It **is** the test: 2 real
WizeLens users, each with a person behind them, each set up from nothing and
operated until their job works or breaks. A persona file is both the **script** and
the **log** — you read it to know what to do, and you write to it as you do it.

---

## RULE #1 — judge it as the WizeLens user, not as an engineer

**Drive the screen.** Click it, type into it, read what comes back, and decide what
a person would do next. Every real defect this project has produced was found by
opening a page or querying the data, and every one of them passed typecheck, lint
and build first.

**Never `fetch()` an endpoint to prove a feature works.** A green API response says
nothing about whether anyone can reach it. API tools and database access are for
**verifying what the UI wrote** — never for doing the work the UI was supposed to
do. If a screen cannot create the thing, that is the finding; creating it through
the API and carrying on erases it.

**The verdict is theirs, not the code's.** A run does not ask "is this implemented
correctly" — it asks **could Dani finish this job, and would they come back
tomorrow?** Those come apart constantly, and where they do, theirs wins:

| Technically | But as the WizeLens user | Verdict |
| --- | --- | --- |
| works | they could not find it, or did not know it was there | broken |
| works | it took nine taps and two screens they did not understand | broken |
| works | the word on the button is not a word they use | broken |
| works | it told them nothing happened, and something did | broken |
| an edge case | it is Tuesday and they do this every Tuesday | major |

So write findings in their terms. **"Dani could not tell whether it saved"**
is the finding; "the mutation resolves before the toast fires" is the cause, and it
belongs further down the same file. An issue whose title only a developer can read
has recorded the symptom from the wrong end.

Three things a WizeLens user never does, so you must not do them either:

- **Read the source to find out whether something works.** Look at the screen. Read
  code only once you are fixing what the screen already proved.
- **Know what the software is called underneath.** If you needed the module name to
  navigate, that is a finding.
- **Try again in a different way because the first way failed.** The first way
  failing IS the result. Record it, then try the second way as a separate note.

The tell that you have drifted: you are reading JSON instead of a screen, or you
are pleased that something works when you could not have found it.

## RULE #2 — real data, never placeholder data

The names, prices, addresses and numbers in each persona file **are the test data**.
Type them as written. No `Test Product 1`, no lorem, no `a@b.com`, no `123`.

Placeholder data hides exactly the defects real data finds: an apostrophe in
`Nia's`, an accent in `Tomás`, a 68-character name, a price with cents, a phone
number with a `+`, a description that wraps to five lines at 360px, a list long
enough to page. A persona whose data is three rows called Test has not tested a
list.

Where a file says "at least N", N is a floor, not a target.

## RULE #3 — file it, fix it, then prove the fix from the same screen

**Stop and fix.** A defect is not logged and left; it is repaired the moment it is
found, and then the step that found it is **done again as the persona** to confirm
the repair. Five beats, in this order, every time:

1. **File** the issue in [issues/](issues/) — before the fix, so a defect that
   turns out to be two defects does not lose one of them.
2. **Fix** it properly, at the single point of change. Not a call-site patch — a
   call-site patch is a deferred fix everyone else pays interest on.
3. **Re-run the exact step**, as the persona, on the screen, with the same data.
   Not a typecheck, not a unit test, not a `fetch`.
4. **Record the confirmation** in the issue: `Status: fixed`, `Fixed:` stamped, and
   one line on how it was proved — the screen, the data, what you saw.
5. **Re-score the screen** in [rating.md](rating.md) if the fix moved it, keeping
   both numbers (`5 → 8`).

Then continue the act. A run is a sequence of repairs, not a survey.

**Why this and not "log it and keep going":** a defect list written on Tuesday gets
fixed in a batch on Friday by somebody re-deriving what the sentence meant, and the
fix never gets driven through the screen that found it. The confirmation is the
part that keeps getting skipped, so it is a numbered beat.

**When a fix genuinely cannot be made now**, say so explicitly in the issue and
keep going — this is the exception, not the escape hatch. It applies to exactly
these:

| Situation | Do |
| --- | --- |
| Needs a schema migration | WizeLens cloud migrations ship in `js/packages/cloud/src/db` and run when the cloud starts; author the file and test it on a fresh PGlite folder, never on a shared database · `Status: open`, `Blocked on: pipeline` |
| Needs a product decision that is Brandon's | `Status: open`, `Blocked on: decision`, state the options |
| The fix is larger than the surface under test | `Status: open`, `Blocked on: scope`, say what it would take |
| Fixing it needs the dev server restarted | Note it, ask Brandon, carry on elsewhere |

Anything not in that table gets fixed now. A bad experience is never parked as
somebody else's call because it is awkward.

**Design failures are defects and are fixed the same way.** Text you cannot read in one theme, a grey screen where color carried meaning, faded text used for hierarchy, body text under 16px, a hardcoded color that ignores dark mode, a CSS class or variable without the `wl-` / `--wl-` prefix, and a control re-skinned by hand instead of the dashboard's own components.
File, fix, look again. `Severity: design`.

**Copy that is FALSE is not a copy defect, it is a major one.** Any sentence
promising something this product does not do, naming a thing it does not have, or
pointing at a screen it does not include, is wrong rather than off-voice.

## RULE #4 — never present absence as measurement

If you did not check something, write **"not checked"**. Not "fine", not
"presumably works", not silence. A run that reports nine of eleven acts and does
not say which two are missing reads as a clean run, and that is worse than an
obviously partial one.

The same applies inside a run: a count that would not load is unknown, not zero.

## RULE #5 — the spine is verified once, then trusted

Every persona walks the same first stretch: wizelens.com → docs → install in kanNINJA → the first trace on `/_wizelens` → the HUD on a real kanNINJA page. **P01 is the deep baseline**
and verifies it properly, act by act, in the data.

The rest walk it at speed and report spine behaviour only where it **differs** — a
different starter, a different pack, a different default. Their value is their own
surface, not another re-verification of signup. If the spine breaks for one persona
and not another, that difference IS the finding.

## RULE #6 — every screen gets a design score and an ease score

Working is the floor, not the result. **Rate every screen you open**, on two axes,
in [rating.md](rating.md):

| Axis | The question |
| --- | --- |
| **Design** | Is it on-system and well-composed? Real components and tokens, real color doing real work, hierarchy from scale and weight, holds at 360px, states (waiting / empty / error) all present and right |
| **Ease** | Could this person do the job without help? Findable, one home per concern, the right data already on screen, no dead ends, words they use, an obvious next step, and reachable by keyboard and thumb |

**The two come apart, and both are reported.** A beautiful screen nobody can
operate is not an 8, and a plain screen that gets the job done in two taps is not a
4. When a single number is wanted, quote the lower one.

**A screen is not scored until you have seen it in light and dark and at 360px.** Not
once per run, per screen. A score taken in one theme at one width is a guess about
the other three.

| Score | Means |
| --- | --- |
| 9–10 | Nothing to fix. 10 is rare and needs a reason written down |
| 7–8 | Right, with named nits |
| 5–6 | Works; they needed a second look or a second attempt |
| 3–4 | They got there by persistence, or it looks unfinished |
| 1–2 | They would stop, ask somebody, or leave |

**The score is not the point — the deductions are.** Every row carries a **gap to
10**: the specific thing that would raise it. That column is the worklist, and
anything in it that is a real defect becomes an issue and gets fixed under RULE #3
rather than sitting in a table as a number.

**Re-score after a fix**, keeping both values (`5 → 8`), so the file shows movement
rather than a final opinion. Screens no persona reached stay `—`; an unrated screen
is unrated, never assumed fine (RULE #4).

## RULE #7 — the 2 are neighbours, and fixes travel

The two personas share one machine but not one account. P01 works in kanNINJA's in-app dashboard; P02 owns a WizeLens Cloud organization, and a neighbour organization ("Harrow & Vance Studio", made in setup with its own project and traces) lives on the same cloud. On the cloud the database row policies and the org stamp are what keep neighbours apart, so this is the first time they meet real neighbours in the data.

### Every persona tries to see somebody else's data

Once per run, deliberately:

- **Search** for something only another WizeLens user has — a rival's name,
  another person's surname, a distinctive word
- **Deep-link a record id** belonging to another account into the address bar
- **Switch account**, if the product offers it, and confirm the whole identity
  swaps — name, branding, data, settings — not just the header

The expected result is nothing: not found, or refused. **A leak here is a `blocker`
and stops the run** — it is the one defect class where continuing to test is the
wrong thing to do.

### A fix made in one run must not break an earlier one

This is the cost of fixing inside the run (RULE #3). After repairing anything in
the **shared spine or a shared screen**, reopen the earliest persona it could touch
and do one real job there.

Record it on the issue as a second confirmation line. A P06 fix that quietly breaks
P01's core flow is otherwise found by nobody, because nobody goes back.

## RULE #8 — the working WizeLens setup is the deliverable, not a step in the run

**Each persona ends with a real, complete, working WizeLens setup.** Not a
demonstration, not the template with the words changed, not "four screens and
done". Something a stranger could use without ever knowing it was a test.

Each persona file carries **its own inventory** under "The setup they leave with". That
list is the definition of done: if an item on it is missing, stock, or still
wearing template copy, the run is not finished. Enumerate before you start;
re-check before you say done.

### What "fully featured" means, on every one of the 2

Not "traces show up". Each persona leaves with a setup a stranger on their team could take over tomorrow: it captures what that persona needs (requests, SQL, browser, errors, logs), it answers the question they came with and the answer is **linkable** (a URL to a trace, a query, a rule), nothing secret is visible in it (passwords, tokens, emails in SQL), and the parts they set up are named in their own words, not `test` or `key 1`.

### The 2 must not be one working WizeLens setup 2 times

Different structures, different looks, different feature mixes. 2 that are the
same template with swapped nouns have tested one path 2 times and told you
nothing.

---

## Standing checks — every run, every persona

These are not acts. They are the things a real person does that the scripted acts
do not, and each persona file names its own concrete instance of each.

**Wrong moves.** Real people make mistakes, and mistakes are where data loss and
wrong money live: delete something other records point at, import the same file
twice, double-click the submit button, press Back after submitting, refund the same
line twice, edit a document after it has been sent. **At least three per run**,
named in the persona file.

**Reload, deep link, restore.** Press F5 on an open screen. Copy the address bar
and open it in a new window. Open a deep link while signed out. A screen you cannot
link to is a screen nobody can be sent to.

**Time and dates.** Check the boundary, not the middle: a time late in the day, a
month end, a due date computed from terms, something 40 days overdue, an expiry at
hour 0 and hour 1. Say which timezone the machine is in when you record the result.

**Numbers at the edges.** Not the happy total — the composition. WizeLens handles no money in these runs, so its irreversible numbers stand in: durations, counts and percentages. Add up the spans of one trace by hand and compare the total. Count the SQL calls of one board load by hand and compare the N+1 count. Compute an error rate or SLO budget by hand from the request counts and compare. A sum that is off by one, a 0 ms where nothing was measured, or an average over zero rows is wrong.
Compute it by hand first, then look. Where they disagree, the software is wrong.

**The other side of the transaction.** Every run ends as the person on the receiving
end, not the operator. Can they get back to what they did? A product where somebody
can transact once and never see it again is broken in a way every operator-side
script would pass.

**Without a mouse.** One full job per run driven by keyboard alone, with the focus
ring visible the whole way. And with thumbs: tap targets, reach, and whether
anything needs hover to be discoverable.

## What every run records

- **The core promise, measured:** minutes from `npm install` to the first trace on `/_wizelens` (P01), and minutes from cloud sign-up to the first kanNINJA trace in the cloud (P02)
- How the lists felt at real volume: a board of 60+ cards, 100+ requests in Requests, a page past the first in every long table
- What the account should have moved: trace count, SQL count on one board load, the N+1 the insight names, the alert that fired, the emails that were sent

---

## Where things run

| Surface | Port | What you use it for |
| --- | --- | --- |
| WizeLens site (first door) | 5190 | marketing pages and docs, from this worktree (`pnpm dev:site`) |
| kanNINJA web (Next.js) | 3000 | the app the personas trace; the HUD; its own dashboard at `/_wizelens` |
| kanNINJA API (Fastify) | 3001 | the API; its own dashboard at `http://localhost:3001/_wizelens` |
| WizeLens Cloud (local) | 5970 | P02's cloud, `js/packages/cloud/dist/cli.js` on a PGlite folder in the scratchpad |
| kanNINJA database (PGlite) | 5433 | local Postgres wire server, one connection, data in the scratchpad |

**Start at the WizeLens site home page (http://localhost:5190/) every time.** Landing straight on `/signup` skips
attribution, the first-touch payload, and the entire reason the marketing site
exists.

**Claude started every process of this exercise in its own kanNINJA worktree (`G:/code/@wizeworks/kanninja/v2-persona`) and its own scratchpad, so Claude may restart those. Never touch Brandon's own kanNINJA checkout (`kanninja/v2`) or any other app on this machine**

## Accounts

One persona, one real account. Never reuse another persona's — the whole point is
starting from nothing.

| Field | Convention |
| --- | --- |
| Email | `p0N.firstname@kanninja.test` |
| Password | `Lantern-Orchard-42!` (local only) |
| Organization / project name | exactly the name in the persona file, apostrophes included |

## Reading email in dev

kanNINJA: no `RESEND_API_KEY`, so kanNINJA writes each email (verification codes, password resets) to the API's console log. The cloud: no Resend or SMTP set, so it prints each mail as `[wizelens-cloud] mail (no mail service set, not sent) to <address>: <subject>` followed by the text, in its own console log. Read the log file of that process; the links in the text are the real links.

**Absence is still not measurement (RULE #4).** If you did not go and look, write
"not checked". What must never happen is a run reporting that an email was sent
because a screen said so.

## Verifying what the UI claimed

Read-only, and only to confirm what the UI said it wrote:

```
kanNINJA:  node -e with postgres.js against postgres://postgres:postgres@127.0.0.1:5433/postgres (only while the API is stopped: the PGlite server takes one connection)
Cloud:     the cloud's own API, signed in as the persona, read-only GETs; or open the PGlite folder in a copy
```

Never write through these. kanNINJA's PGlite server accepts one connection, so a second client blocks the API: read through kanNINJA's own screens first, and only stop the API to read the database when a screen's claim cannot be checked any other way.

---

## Issue files

Name: `NNN-short-kebab-slug.md`, a flat global sequence starting at `001-`. Global
rather than per-persona, because most defects live in the shared spine and
numbering them by who happened to find one implies an ownership that is not real.

Use [issues/_TEMPLATE.md](issues/_TEMPLATE.md). The header block is fixed:

```
**Status:** open · fixed · wontfix · duplicate of #NNN
**Severity:** blocker · major · minor · design · copy
**Found by:** P03 · kanNINJA ops · act 4
**Surface:** Cloud › Database › Query shape
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P03 act 4 — <what you did and saw>
**Blocked on:** — (pipeline · decision · scope, only when the fix could not be made)
```

**Title it the way the WizeLens user would say it.** The cause goes in **Where
it lives**, not in the heading (RULE #1).

| Severity | Means |
| --- | --- |
| blocker | cannot proceed · data loss · wrong money · a security exposure |
| major | a real job cannot be finished the way a person would do it, or a sentence on screen is FALSE |
| minor | friction, confusion, a wrong count, an ugly edge |
| design | breaks a binding design rule |
| copy | off-voice, jargon, wrong vocabulary — true, but the wrong words |

**When an issue is fixed, it stays.** Set `Status: fixed`, stamp `Fixed:`, and
record what the fix was, where it landed, and **how it was confirmed from the
screen**. A fix with no confirmation line is not fixed. This is a defect ledger,
not a queue.

There is deliberately **no index of issues**. `ls issues/` is the index, and a
hand-maintained table would be wrong within two runs.

## What is out of scope on a run

Fixing what the run finds is the job (RULE #3). These are the edges of it:

- **Redesigning a screen you are only passing through.** A screen you did not open
  as the persona gets no score and no rewrite.
- **A fix bigger than the surface under test.** File it, mark `Blocked on: scope`,
  say what it would take, and keep the run moving.
- **Running a migration.** WizeLens cloud migrations ship in `js/packages/cloud/src/db` and run when the cloud starts; author the file and test it on a fresh PGlite folder, never on a shared database
- **Restarting the dev server.** Claude started every process of this exercise in its own kanNINJA worktree (`G:/code/@wizeworks/kanninja/v2-persona`) and its own scratchpad, so Claude may restart those. Never touch Brandon's own kanNINJA checkout (`kanninja/v2`) or any other app on this machine
- **Committing or pushing.** Commit the persona files and every fix on this branch, one commit per fix. Push and open ONE pull request at the end of the exercise (the repo's one-PR-per-plan rule). Never commit the kanNINJA worktree's test-only edits (`.env`, tarball overrides)
- **Resizing the browser window.** Check 360px in device emulation or an iframe,
  never by resizing somebody's actual window.

## How to run one

1. Read the persona file top to bottom before touching anything.
2. Set `Status: in progress` and stamp the date in **Run log**.
3. Work the acts in order. Each act names its jobs and what "done" means.
4. Fill in the **Account** block as soon as signup gives you the values. A run
   nobody can revisit is a run nobody can confirm.
5. **On every screen you open**: score it in [rating.md](rating.md) in light and dark
   and at 360px, and write its gap to 10 (RULE #6).
6. **On every defect**: file, fix, re-run the step as the persona, confirm in the
   issue, re-score the screen (RULE #3). Do not carry it to the end of the run.
7. Work the **standing checks** as you go. The persona file names its own instance
   of each.
8. Complete **Verification** honestly at the end, including what you skipped.
9. Set `Status: done` only when every act has a recorded outcome — including
   "blocked on a decision, issue #012". Silence is not an outcome.

## Definition of done — the whole exercise

- All 2 persona files at `Status: done`, every act with a recorded outcome
- Every defect in `issues/` carrying a status, and every `fixed` one carrying a
  confirmation line naming the screen it was re-proved on
- [rating.md](rating.md) scored for every screen the runs opened, each with a gap
  to 10, and the unreached ones still visibly `—`
- **2 complete, working WizeLens setups** — every item in every persona's inventory built,
  working, and looking like its own thing rather than one template 2 times

2 scripts and no runs is nothing. 1 runs and one stock persona is
an unfinished deliverable that reads as finished. 2 runs with a hundred logged
defects and no fixes is a survey, which is not what this is.
