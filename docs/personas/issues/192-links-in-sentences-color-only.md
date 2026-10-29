# 192 — Links inside sentences look like the words around them, except for color

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (Kubernetes, Connect, Connect › server, Connect › AI read keys)
**Surface:** Every link inside a note or sentence
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Kubernetes, Connect, Connect › server, Connect › AI read keys, 1440 and 360, light and dark, 18:26

## What happened

"How to set it up" on the empty Kubernetes page, "Thresholds and hidden keys" on Connect › server, "Sending keys" and
"Services" in the Connect notes had no underline. In light the link blue and the grey text differ by 1.06 to 1; in
dark, 1.23 to 1 to 2.77 to 1. A person who does not see color well cannot find the link.

## Where it lives

`js/packages/ui/src/styles/base.css`: links had no underline until hovered.

## Fix

A plain link inside a paragraph, list, note, empty-page text or banner is underlined. Buttons and styled links keep
their look.

## Confirmation

- 18:26, Ifeoma: "How to set it up", "Thresholds and hidden keys", "Sending keys" and "Services" are underlined;
  axe finds no link-in-text-block fault on any of the 33 cloud screens in the four views.
