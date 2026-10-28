# 080 — A site with no server finds no way in

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 1
**Surface:** Site › menu, and Docs › Quick start
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P04 · act 1 on a 390 px phone; RULE #7 on the desktop Platforms menu
**Blocked on:** —

## What happened

Noor builds static sites. On her phone she opened wizelens.com and the menu: it lists .NET, Node, React and Next.js,
Vue, Angular, Svelte, Java, Python and Go. Nothing for a static site or a script tag. She tapped Get started: the
quick start begins "1. Add it to your API", and the browser is step 3, "optional". The word "static" is on neither
page. A person with no server reads that WizeLens is not for her.

## What should have happened

From the menu or the quick start, one tap to "a static site: one script tag and a browser key".

## Where it lives

The steps exist: `site/content/docs/browser.md` has a "Static sites" section, 165 lines down a 188-line page. Nothing
links to it: `site/src/components/nav/Nav.tsx` (`PLATFORMS`) and `site/content/docs/quick-start.md` do not.

## The fix

The site menu (Platforms) and the footer list "Static sites — One script tag, no server", linked to
`/docs/browser/#static-sites`. The quick start opens with "No server? A static site … needs one script tag and a browser
key" and the same link. The Static sites section now puts the script tag first, says where it goes (before
`</body>`), and says the browser key starts `wl_bk_` and an ingest key (`wl_ik_`) never goes in a page; the bundler
code follows.

## Confirmed by

2026-10-27, by 21:20, 390 px phone, light: home → Menu → "Static sites" lands on the Static sites heading, with the
script tag as the first code block and the key words right under it. The quick start shows the "No server?" line
above step 1. RULE #7, desktop 1440, light and dark: the Platforms menu lists Static sites among the ten.
