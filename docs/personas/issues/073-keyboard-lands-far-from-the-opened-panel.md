# 073 — Opening a request by keyboard leaves Sid 30 Tabs from its panel

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · standing check "without a mouse" (act 5)
**Surface:** Requests, Errors, Insights, Security and Services detail panels (in-app and cloud)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 5 by keyboard · Requests; P02 · cloud Requests
**Blocked on:** —

## What happened

Keyboard only: Requests → search `/Basket` → Tab to the `GET /Basket` row → Enter. The panel opened on the right, but
focus stayed on the row. To reach "View full trace", Sid had to Tab through the other 14 rows, the pager and the
panel's tabs: 30 Tabs. Closing the panel dropped focus to the top of the page.

## What should have happened

Enter on a row puts focus in the panel it opened; closing the panel puts focus back on the row.

## Where it lives

The five detail panels share the `wl-side-head` head, and none of them moved focus.

## The fix

`ui/useOpenFocus.ts`: when a panel opens or changes item from a table row, its title (`tabIndex={-1}`) takes focus;
on close, focus goes back to that row. A panel open on page load, or paged by its own buttons, leaves focus alone.
Used by the Requests, Errors, Insights, Security and Services panels.

## Confirmed by

2026-10-27 20:07, P03 keyboard only, https://localhost:5001/_wizelens: Requests (7 Tabs) → Search (28) → `/Basket` →
row (16) → Enter: focus on "GET /Basket" in the panel. Tab → "Close request details" → Enter: focus back on the row.
Enter again → "View full trace" in 10 Tabs (was 30) → SQL tab in 9 → three queries with times. Focus ring visible at
every stop, light theme.

RULE #7, 2026-10-27 20:08: P02 Greta, cloud Requests (Last 7 days), keyboard: row `GET /api/health` → Enter: focus on
the panel title "GET /api/health".
