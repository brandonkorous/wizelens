# 007 — Without a mouse, Dani had to Tab through the whole menu on every page to reach it

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 6 (without a mouse)
**Surface:** Dashboard shell (every page, every host)
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 6 keyboard path — Tab, Enter on "Skip to content", next Tab landed on the page's first control
**Blocked on:** —

## What happened

From `http://localhost:3000/_wizelens/`, Tab ×10 reached **Database**; Enter opened it,
but focus stayed in the menu. The next 24 Tabs walked Rendering, Metrics, … Settings,
Docs, the version link, the search, the environment, the time range, the
notifications and the theme button before the first control of the Database page.
No "Skip to content" anywhere.

## What should have happened

The first Tab offers "Skip to content", and it lands on the page.

## Why it matters

25 key presses per page before the page; the keyboard check in every run pays it.

## Where it lives

`js/packages/ui/src/App.tsx` — the shell renders `Sidebar` and `TopBar` before
`<main>` with no skip control.

## The fix

A "Skip to content" button is the shell's first control (`.wl-skip`, hidden until
focused, `layout.css`); it focuses `<main id="wl-content" tabIndex={-1}>`. A button,
not an `href="#…"` link, because the dashboard's routes live in the hash. One shell
(`App.tsx`) serves the in-app dashboard, the hub and the cloud, so all get it.

## Confirmed by

> Re-ran P01 act 6: `http://localhost:3000/_wizelens/`, Tab → `Skip to content` (2 px ring),
> Enter, Tab → `Total Requests 679`. On `#/database`: Tab, Enter, Tab → `Service` filter.

## Rating effect

In-app › Database — Ease 6 → 7 (keyboard)
