# 201 — An address for a tab this dashboard does not have opens another tab and says nothing

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (in-app `#/connect/keys`, `#/connect/read-keys`, `#/settings/retention`, `#/settings/checks` on eShop)
**Surface:** Every page with tabs (Connect, Settings, Organization, People, Account), in-app and cloud
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at in-app Connect (`#/connect/keys`) and cloud Organization (`#/organization/no-such-tab`), 360 light and dark, 18:54

## What happened

Sending keys, AI read keys, Data retention and Thresholds are cloud and hub tabs. In the in-app dashboard their
addresses opened Sends to or Tags instead, with nothing to say the asked-for tab is not here. A person who followed a
link from the docs saw the wrong page and no reason. A missing tab looked the same as a correct one.

## Where it lives

`js/packages/ui/src/ui/Sections.tsx`, `SectionLayout`: it fell back to the first tab without a word.

## Fix

When the address names a tab the page does not have, a blue note above the first tab says: "The section in this
address is not on this dashboard, so this shows Sends to." One change covers every tabbed page.

## Confirmation

- 18:53, Ifeoma on eShop at 360: `#/connect/keys` shows the note above Sends to.
- 18:54, on the cloud at 360 dark: `#/organization/no-such-tab` shows the note above Projects; no axe fault.
