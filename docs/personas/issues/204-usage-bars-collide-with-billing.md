# 204 — Usage bars break: the percent drops under and beside the bar

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, scoring pass (cloud `#/kubernetes` and a node page)
**Surface:** Kubernetes, Hosts, and a service's infrastructure panel
**Filed:** 2026-10-29
**Fixed:** 2026-10-29 (PR #124)
**Confirmed by:** P06 Ifeoma at cloud `#/kubernetes` and a node page, desktop light and dark, 03:00

## What happened

In the Memory column, a pod with a limit showed a bar with its percent low and far to the right, and no amount; a
pod without a limit showed "430 MB". One column, two kinds of value, and a broken bar.

## Where it lives

`infra.css` and `billing.css` both styled `.wl-usage`; Billing's `display: grid` won and stacked the parts.

## Fix

The infra bar is `.wl-meter` now. Kubernetes CPU and memory cells always show the amount, with the bar and its share
of the limit or allocatable in the title and for screen readers.

## Confirmation

- 03:00, cloud `#/kubernetes`: each row shows a bar and "130 MB" on one line.
- 03:01, node page: CPU and memory cells the same, dark too.
