# 116 — On a 360 px phone, the Alerts tables squeeze each name to one word per line

**Status:** fixed
**Severity:** design
**Found by:** P04 · Haddad Studio · scoring sweep at 360 px (light and dark)
**Surface:** Alerts › Rules and Recent notices (and any table with long text on a phone)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P04 Alerts at 360, 2026-10-28 00:46; P02 Greta Alerts at 1440, 00:46

## What happened

At 360 px the Rules table showed her alert "Site down → Noor's phone (email)" one word per line, five lines tall;
the rule text did the same; the "Last value" header was cut at the edge. In Recent notices the time "1h ago" sat
half under the "Resolved" badge. The tables can scroll sideways, but the columns shrink to fit the screen first.

## What should have happened

On a phone a text column keeps a readable width, and the table scrolls sideways for the rest.

## The fix

- `ui/src/styles/ui.css`: up to 720 px, a `wl-wrap` text column is at least 22ch wide and a bold name at least 14ch;
  the table scrolls sideways in its panel instead.
- `pages/alerts/AlertsPage.tsx`: the notice's "Alert" column is a `wl-wrap` column; the rule's actions are one line.
  `styles/pages/alerts.css`: the actions do not wrap on a phone; `touch.css`: their Mute box is 44 px on touch.

## Confirmation

- 00:46, Noor's phone at 360: her rule row went from 167 px to 83 px ("Site down → Noor's phone (email)" on three
  lines, rule text on two); notice rows from 145 px to 64 px, "2h ago" beside its badge. Both tables swipe sideways
  (1064 and 758 px wide in a 326 px panel).
- Rule 7, 00:46: Greta at 1440: both tables fit (1158/1158), no sideways scroll.
