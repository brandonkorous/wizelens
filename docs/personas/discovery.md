# Discovery — WizeLens

Written before the roster, on 2026-10-26.

**Product, in the customer's words:** "Open the hood on one request: the click,
every service it touched, and every SQL query, in one timeline — like Glimpse."
**The promise with a number in it:** "Two lines in .NET, one middleware in Node,
one provider in React" (README). Measured as minutes from install to first trace.
**The customer:** developers (high technical level) and the people who run what
they build (DBAs, SREs). They lose a weekend to a wrong guess, or an outage they
hear about from a customer. Desktop first; alerts are read on a phone.

## Axes of variance

| Axis | Values | What each selects in code | Unreachable here |
| --- | --- | --- | --- |
| Host | in-app, hub, cloud | `Capability` set per host (`core/src/types.ts`, `node/src/info.ts`, `hub/src/api.ts`, cloud); nav items gated by `needs` (`ui/src/shell/nav.ts`) | hub (not in this roster) |
| Server stack | Node, .NET, Python, Java, Go | separate add-ons | all but Node (no local .NET) |
| Browser framework | React, Vue, Angular, Svelte, script tag | separate packages over lens-browser | all but React |
| SQL driver | postgres.js (Drizzle), pg, Prisma, … | adapter per driver in lens-node | only postgres.js |
| Role (cloud) | owner, admin, member, viewer, no access | People & access, project access | — |

## The spine

1. Site home `http://localhost:5190/` → `/node`, `/react`, `/docs/nextjs`
2. Install / upgrade the packages in kanNINJA (`G:/code/@wizeworks/kanninja/v2-persona`)
3. First trace on `http://localhost:3000/_wizelens` and `http://localhost:3001/_wizelens`
4. The HUD on a real kanNINJA page
5. (Cloud) `http://localhost:5970/` → create account → verify → org → project → keys → first trace

## Screens

**169 screens**, enumerated by `gen-screens.mjs` from the nav, section lists,
route helpers, auth pages, site app folders and docs. Excluded: hub-only screens,
Hosts / Kubernetes with infra data, non-Node add-ons.

## Where it runs

| App | Port | Start command | May I start it? |
| --- | --- | --- | --- |
| WizeLens site | 5190 | `pnpm dev:site` (this worktree) | yes — Claude's worktree |
| kanNINJA web | 3000 | `pnpm dev:frontend` (kanNINJA worktree) | yes — Claude's worktree |
| kanNINJA API | 3001 | `pnpm dev:backend` (kanNINJA worktree) | yes — Claude's worktree |
| kanNINJA DB | 5433 | `pglite-server --db=<scratchpad>/kanninja-db --port=5433 --max-connections=1` | yes |
| WizeLens Cloud | 5970 | `node js/packages/cloud/dist/cli.js --database pglite:<scratchpad>/cloud-db --signup open --allow-private-targets --public-url http://localhost:5970` | yes |

kanNINJA runs on the local WizeLens build (tarballs packed from this worktree,
wired by `pnpm.overrides` in the kanNINJA worktree only). It needed a fake
`STRIPE_SECRET_KEY` to boot; no money can move with it.

## Accounts

`p0N.firstname@kanninja.test` · `Lantern-Orchard-42!` · dev mail is printed to
each process's console log (kanNINJA: no Resend key; cloud: no Resend or SMTP).
Machine timezone: America/Los_Angeles (UTC-7 on 2026-10-26).

## Not found

- How the hub is meant to be used next to the cloud: not needed by this roster
- Whether the local cloud's mail log prints full links with `--public-url`: not measured yet (P02 act 1 measures it)
