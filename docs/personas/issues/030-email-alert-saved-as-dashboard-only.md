# 030 — I chose "Email to members" and the alert saved as "Dashboard only"

**Status:** fixed
**Severity:** major
**Found by:** P02 · kanNINJA ops · act 7
**Surface:** Cloud › Alerts › New alert / Edit (Notify)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P02 act 7 keyboard only — Overview → Alerts (23 Tabs) → Edit → Add a channel: focus lands on "Send to" at once; Email to members shows Greta already ticked; Save → Rules reads **Sends to: Email**. With the mouse, unticking Greta and saving shows "Tick at least one member under “Email to members”, or remove that channel." and keeps the rule as it was.
**Blocked on:** —

## What Greta saw

She made `API error rate > 2% (5 min) — page Greta`, pressed "Add a channel", picked "Email to members", and
saved. The Rules table said **Sends to: Dashboard only**. No message. She tried again with the mouse
through Edit: same. Only then did she see the list "Send to these members" under the channel, with herself
not ticked. The alert would have fired at 3 a.m. and woken nobody.

With the keyboard it was worse: after "Add a channel" the focus stayed on the button, and the new
"Send to" box sat above it, 15 Tabs away (or 2 Shift+Tabs, which nothing tells you).

## Where it lives

- `ui/src/pages/alerts/AlertForm.tsx` `cleaned()`: drops every channel that is not filled in, so an
  email channel with no member ticked vanished on save.
- `ui/src/pages/alerts/ChannelFields.tsx`: a new email channel starts with `to: []`; a new row does not
  take the focus.

## Fix

- Save stops with "Tick at least one member under “Email to members”, or remove that channel." instead of
  dropping it.
- Picking "Email to members" starts with the person making the rule ticked.
- A new channel row takes the focus on its "Send to" (`Select` gets `autoFocus`).
