# 061 — The HUD sits on my store's "Pay Now" button, and I cannot scroll it free

**Status:** fixed
**Severity:** major
**Found by:** P03 · Ashgrove & Peña Outdoor Supply · act 4
**Surface:** HUD on a Razor page (`/Basket/Checkout`)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** P03 · act 4 · /Basket/Checkout
**Blocked on:** —

## What happened

On `/Basket/Checkout` with Basket A, eShop's `[ PAY NOW ]` is the last thing on the page, bottom right. Sid scrolled
to the end (End key): the button stays at y = 701–756 in a 900 px window and the HUD card covers its lower half;
`document.elementFromPoint` at the button's centre is `WIZELENS-HUD`. With the HUD details open it is covered fully.
A click on the centre goes to the HUD.

## What should have happened

The last line of any page can be scrolled above the HUD. #011 gave a "bottom left" switch, but eShop's `[ BACK ]`
is bottom left, so the switch moves the problem; minimizing works but Sid must know to do it at the one button that
takes money.

## How to reproduce

1. eShop with the HUD; Basket A; `/Basket/Checkout`; press End.
2. Try to click `[ PAY NOW ]` at its centre. Every time at 1440 × 900.

## Why it matters

The HUD gets in the way of the store's checkout, the one job Sid is testing for Black Friday.

## Where it lives

`js/packages/browser/src/hud/` — the card is `position: fixed` at the bottom right and the page has no room under
its last line.

## The fix

`hud/room.ts` `keepRoomFor`: while the HUD runs, a page that scrolls gets an empty `aria-hidden` block at the end
of `<body>` as tall as the HUD card plus 16 px, so the page's last line scrolls above the card. A page that does not
scroll (an app shell with its own scroll area, like the WizeLens dashboard) gets none, so no new scrollbar appears.
It follows the page's size (ResizeObserver) and the card's (minimized, expanded). `hud/controller.ts` starts and stops
it with the HUD. Test: `room.test.ts`. The open details panel still covers what is under it; Escape or × closes it.

## Confirmed by

2026-10-27 19:07, P03 Sid, `/Basket/Checkout` with Basket A, details closed, End: `[ PAY NOW ]` at y = 532 in a
900 px window, eShop's footer below it, the HUD card below the footer; `elementFromPoint` at the button's centre is
the button (`INPUT`). Room block 169 px.
