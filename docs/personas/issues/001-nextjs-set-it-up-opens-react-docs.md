# 001 — Dani clicked "Set it up" on the React and Next.js page and got the plain React docs

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 1
**Surface:** Site › /react (React and Next.js)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 1 — /react shows React setup and Next.js setup; Next.js setup opened /docs/nextjs/
**Blocked on:** —

## What happened

Dani opened **Platforms › React and Next.js** ("From the click to the database"),
then the big blue **Set it up** button. It opened `/docs/react/`, whose install is a
Vite `main.tsx`. Dani runs Next.js; they had to find **Next.js** in the docs side menu
to get `instrumentation.ts` and `next.config.mjs`. The Next.js link is on the page,
but only in the docs list far below the hero.

## What should have happened

A page titled for React **and** Next.js offers both setups where the eye lands: one
button per framework.

## How to reproduce

1. http://localhost:5190/ → Platforms → React and Next.js
2. Click **Set it up** → `/docs/react/`. Every time.

## Why it matters

The first click of a Next.js developer goes to the wrong guide. Cheap to recover,
but it is the very first impression of "is this for my stack".

## Where it lives

`site/src/sections/stacks/StackPage.tsx` (Hero: one button to `stack.docs[0]`);
`site/src/sections/stacks/data/react.ts` (docs list).

## The fix

Stack pages take `setups` (how many of the first docs links are setup guides). The hero draws one button
per guide; a stack with one guide keeps "Set it up" + "Quick start". React sets `setups: 2` (React setup,
Next.js setup). Files: `site/src/sections/stacks/types.ts`, `StackPage.tsx` (`SetupButtons`), `data/react.ts`.
Siblings checked: every other stack page has one setup guide first (Node lists Next.js second, but the Node
page is for Express, Fastify, Koa, Hono; Next.js lives on the React page), so only React changes.

## Confirmed by

> Re-ran P01 act 1. http://localhost:5190/react/ shows **React setup** (primary) and **Next.js setup**
> beside it. Clicked Next.js setup: `/docs/nextjs/`, heading "Next.js". At 360px both buttons stack full width.

## Rating effect

Site › react — Ease 6 → 8
