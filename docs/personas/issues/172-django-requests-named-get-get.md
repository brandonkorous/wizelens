# 172 — Django requests show "GET GET invoice/<int:order_id>" and no path

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 6 (the Ostrava Bikes Django shop, by the Python docs; then Requests and a tag preview)
**Surface:** Requests, Traces, tag previews, endpoints: every list of a Django service's requests
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Requests and Organization › Tags › New tag, 1440 light, 16:38

## What happened

Requests listed the Django shop's calls with the Path "GET invoice/<int:order_id>" beside the Method "GET", so the
tag preview read "GET GET invoice/<int:order_id>". The real path (`/invoice/1`) showed nowhere in the list, and no
route started with "/", unlike the Go service next to it ("/report").

The span's attributes on screen showed why: Django's instrumentation sends the address only as `http.url` (no
`http.target`), so `url.path` stayed empty and the list fell back to the span name. Its `http.route` is Django's
pattern, `invoice/<int:order_id>`, with no leading slash.

## Where it lives

`js/packages/hub/src/otlp/semconv.ts` (`splitTarget`), where older names are mapped as spans arrive, for the hub and
the cloud alike.

## Fix

A server span with no `url.path` takes it (and `url.query`) from `url.full`; a route with no leading slash gets one,
as the .NET add-on already does. Client spans are left alone. Test: `semconv.test.ts`. Spans stored before the fix
keep their old names.

## Confirmation

- 16:38, Ifeoma: new Ostrava requests read `/invoice/1`, `/report`, `/orders`, `/checkout`, `/bikes`; the tag preview
  reads "GET /invoice/1 GET /report …".
