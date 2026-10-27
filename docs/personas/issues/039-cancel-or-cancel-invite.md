# 039 — "Cancel" or "Cancel invite"? One of them keeps the invite

**Status:** fixed
**Severity:** copy
**Found by:** P02 · kanNINJA ops · act 9
**Surface:** Cloud › People & access › Pending invites › Cancel
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 9 — invited Siobhán again, pressed Cancel on her row: the buttons read **Keep invite** and **Cancel invite**; Keep invite left the row, Cancel invite removed it (Cloud › People & access › Pending invites)
**Blocked on:** —

## What Greta saw

She pressed Cancel on Siobhán's pending invite. The question read "Cancel this invite? The link for
p03.siobhan@kanninja.test stops working." with two buttons side by side: **Cancel** and **Cancel invite**. The
first keeps the invite. A person who means "yes, cancel it" can press the first and believe it is done.

## Where it lives

`ui/src/ui/Dialog.tsx` names the dismiss button "Cancel" on every question, including the one whose action
is itself a cancel (`pages/people/InvitesPanel.tsx`).

## Fix

- `AskOptions.cancelLabel`: the question can name its other button; "Cancel" stays the default.
- The invite question says **Keep invite** and **Cancel invite**.
