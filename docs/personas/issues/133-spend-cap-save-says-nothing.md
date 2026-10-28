# 133 — Marisol saved a $150 spend cap and the page said nothing

**Status:** fixed
**Severity:** minor
**Found by:** P05 · Kaweah Valley Credit Union · act 8, the cap
**Surface:** Organization › Billing › Spend cap
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P05 Marisol at 360, dark, touch, 03:04

## What happened

She typed 150 and pressed Save. No line appeared. Only a reload showed 150 in the box. At the moment she most needs to
know what the cap does (data stops), the page was silent.

## Why

The form had a "Saved." note, but saving reloads the usage, and the form is keyed by the cap, so the new cap remounted
the form and the note was thrown away.

## The fix

`ui/src/pages/organization/BillingSection.tsx`: the note lives in `BillingSection`, so it outlives the remount, and it says
what the cap now does: "Saved. Extra data stops at $150 a month; after that new data is refused until the 1st." (empty:
"Saved. No limit: extra data is billed as it is used.")

## Confirmation

- 03:04, Marisol (360, dark, touch): clears the box, Save → "Saved. No limit: extra data is billed as it is used."; types
  150, Save → "Saved. Extra data stops at $150 a month; after that new data is refused until the 1st." Reload keeps 150.
