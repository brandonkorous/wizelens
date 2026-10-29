# 185 — A Go service sends no metrics, so Metrics stays empty

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 7 (Metrics, for the Hälsa Clinics Go API)
**Surface:** Metrics (Go SDK); Site › Docs › Go
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Metrics, 1440 light, 17:29

## What happened

With the Hälsa project picked, Metrics read "No metrics in this range. Pick a wider range, or check that your
services send metrics." The service was sending traces and logs. The docs say Metrics shows "CPU, memory, GC, request
times" per service on every host, and the Django shop showed them; the Go service never could, because
`wizelens.Start` set up tracer and logger providers only. This is the "covers two of their stacks" gap Ifeoma came
to check for.

## Where it lives

`go/start.go` and the new `go/metrics.go`; `js/packages/core/src/metrics/runtime.ts` (the Memory tile's names);
`site/content/docs/go.md`.

## Fix

`Start` also sets a global meter provider that sends by OTLP every 30 seconds (the same endpoint and token rules as
traces), so otelhttp and otelsql record request and query times, and starts the contrib Go runtime metrics (memory,
goroutines, GC goal). `WithMetricReader` swaps the sender for tests. The Memory tile knows `go.memory.used`. The Go docs
list the metrics and the option. Test: `go/metrics_test.go`.

## Confirmation

- 17:29, Ifeoma: Metrics for halsa-booking-api lists 13 metrics (`http.server.request.duration` 8 series,
  `db.client.operation.duration`, `go.memory.used`, `go.goroutine.count` 50, …), with tiles "Memory 7.40 MB" and
  "Request time 272 ms".
