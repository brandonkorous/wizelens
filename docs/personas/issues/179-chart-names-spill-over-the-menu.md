# 179 — Chart line names list every attribute and spill out of the card over the menu

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 7 (dashboard "On-call — Monday 08:00 review", chart of p95 request time)
**Surface:** Dashboards › a dashboard; Metrics (the same line names)
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Dashboards › On-call — Monday 08:00 review, 1440 light, 17:09

## What happened

Each line was named by all 15 of its attributes ("http.method=GET · http.server_name=kubernetes.docker.internal ·
http.scheme=http · net.host.name=… · http.request.method=GET · …"). The legend did not wrap and was centered, so the
names ran out of both sides of the card and were drawn over the left menu.

## Where it lives

`js/packages/core/src/metrics/model.ts` (`seriesLabel`), `js/packages/ui/src/styles/ui.css` (`.wl-chart-legend`).

## Fix

A line is named by the attributes that differ between lines only, and an old name (`http.method`) is left out when its
current name (`http.request.method`) is there. The old-to-current name map moved from the hub to core
(`core/src/semconv.ts`), so ingest and line names use one list. The legend wraps inside its card. Tests:
`metrics.test.ts`; the frozen legacy model names lines the same way, so the parity test still compares the numbers.

## Confirmation

- 17:09, Ifeoma: the chart's legend sits inside the card, one line each: "http.request.method=GET ·
  http.response.status_code=200 · url.path=report", "… 500 · url.path=invoice/<int:order_id>", and so on.
