# 081 — On a phone, the Copy button hides the code it copies

**Status:** fixed
**Severity:** design
**Found by:** P04 · Haddad Studio · act 1
**Surface:** Docs › every code block (seen on Browser › Static sites)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P04 · act 1, Static sites on a 390 px phone
**Blocked on:** —

## What happened

On her phone, Noor read the script tag in Static sites. The "Copy" button sat on the first line of each code block and
hid the middle of it: `<script src="https://cdn.jsdeli` … `m/`. She could not read the tag she was about to paste.

## What should have happened

The button sits beside or above the code, and every character can be read by scrolling the block.

## Where it lives

`site/src/styles/prose.css`: `.wl-pre-copy` is placed over the top right of the block. On a touch screen it always
shows (`@media (hover: none)`), and a long line scrolls sideways under it.

## The fix

On touch screens (`@media (hover: none)`, where the button always shows) every docs code block gets a 50 px strip at
the top for the button, from the first paint, so no line runs under it and an anchor jump does not move. Desktop
keeps the button over the corner, shown on hover.

## Confirmed by

2026-10-27, by 21:03, 390 px phone: Menu → Static sites. "Copy" sits in a strip above the script tag, and the line reads
`<script src="https://cdn.jsdelivr.net/npm/` up to the edge, then scrolls. The page lands on the Static sites heading.
