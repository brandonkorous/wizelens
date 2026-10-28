# 154 — Six docs pages are wider than a phone, so the phone shrinks them

**Status:** fixed
**Severity:** design
**Found by:** P06 Ifeoma, act 3 (docs at 360)
**Surface:** Site › docs: no-code install, cloud, hub, java, node, python
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at 360 light, 16:04

## What happened

On a 360 px phone, Install with no code change, WizeLens Cloud, The local hub, Java, Node and Python were 395 to 611 px
wide. The phone zoomed the whole page out to fit, so the text was too small to read without pinching.

## Where it lives

`site/src/styles/prose.css`: inline code in docs text wraps only at spaces (`white-space: break-spaces`). One long word,
such as `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer…` or `pip install "wizelens @ git+https://…"`, cannot break.

## Fix

Inline code also breaks inside a long word (`overflow-wrap: anywhere`).

## Confirmation

- 16:04, Ifeoma: after the rebuild the width check at 360 finds no page wider than the phone (49 pages); `/docs/go` and `/docs/python` keep their inline code inside the screen.
