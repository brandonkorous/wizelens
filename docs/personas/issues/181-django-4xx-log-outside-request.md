# 181 — Django's 4xx log lines show "Outside a request"

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 7 (Logs, for the Ostrava Bikes Django shop)
**Surface:** Logs (Python SDK)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Logs, 1440 light, 17:16

## What happened

A failed checkout logs "Conflict: /checkout" (warn, `django.request`). Logs showed it as "Outside a request", with
no link to the trace, while the "Out of stock" line from the same checkout had its request. Every 4xx line Django
writes looked like a background job: the reader cannot go from the warning to the request.

## Where it lives

Django logs a 4xx in `BaseHandler.get_response`, after the middleware chain returns, so after the OpenTelemetry
middleware has closed the span and taken it off the request. A 500 is logged inside the chain, so it had its request.
The fix is in `python/src/wizelens/`: `request_logs.py` (new), `distro.py`, `setup.py`.

## Fix

The distro hands the Django instrumentation a `request_hook` that keeps the server span on the request. The log
handler gives a line with no span of its own the span of the request Django passes with it (`request=`). Sampling is
unchanged: the line follows its trace's decision. Tests: `tests/test_request_logs.py`.

## Confirmation

- 17:16, Ifeoma: the shop started with the docs' command, two rounds of traffic. Logs: "5:16:28 PM Warn ostrava-shop
  django.request Conflict: /checkout client-ostrava POST /checkout".
