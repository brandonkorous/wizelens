# 032 — "Delete" removed my alert at once, without asking

**Status:** fixed
**Severity:** minor
**Found by:** P02 · kanNINJA ops · act 7 (cleaning up after #031)
**Surface:** Cloud › Alerts (list and rule page), SLOs › one SLO, Uptime (list and one check)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 7 — "Delete" on `Slow SQL on the board load (≥ 250 ms)` asked "Delete Slow SQL on the board load (≥ 250 ms)? It stops checking and sends nothing more."; Cancel kept the rule, "Delete alert" removed it (Cloud › Alerts)
**Blocked on:** —

## What Greta saw

To remove the double from #031 she pressed "Delete" on the second row. The rule was gone at once: no
question, no undo. "Delete" sits next to "Edit" and "Test" in a row of small links, so one slip on a phone
removes a rule that was meant to wake her. Deleting a project, revoking a key, and deleting several checks
at once all ask first; deleting one alert, one SLO, or one uptime check did not.

## Where it lives

`ui/src/pages/alerts/RuleActions.tsx` (`onDelete` called straight from the link), `pages/slos/SloPage.tsx`
`remove`, `pages/uptime/UptimePage.tsx` `actionsOf().onDelete`, `pages/uptime/CheckDetail.tsx` Delete.

## Fix

The dashboard's own question (`useAsk().confirm`, danger style) before each:

- Alerts: in `RuleActions`, so the list and the rule page both ask. "Delete ‹name›? It stops checking and
  sends nothing more. This cannot be undone." → **Delete alert**.
- SLO: "Its budget history and any alert on its burn rate stop working." → **Delete SLO**.
- Uptime: one text for the list and the check page (`uptimeParts.deleteCheck`), the same words as the
  bulk delete → **Delete check**.
