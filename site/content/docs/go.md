---
title: Go
description: The OpenTelemetry Go SDK and contrib instrumentation with WizeLens defaults, in one module. N+1 queries, SQL parameters, request bodies, and logs.
---

## The WizeLens module

Go has no agent: services use the OpenTelemetry SDK and the contrib instrumentation. The WizeLens module sets them up
in a few lines and adds what they leave out. Requires Go 1.26 or newer.

```bash
go get github.com/brandonkorous/wizelens/go
```

```go
import wizelens "github.com/brandonkorous/wizelens/go"

shutdown, err := wizelens.Start(ctx, wizelens.WithServiceName("inventory"))
defer shutdown(context.Background())

db, err := wizelens.OpenDB("pgx", dsn, "postgresql")              // queries, with their parameters
client := &http.Client{Transport: wizelens.Transport(nil)}       // outgoing calls carry the trace
log := wizelens.Logger("inventory", slog.Default().Handler())    // log.InfoContext(ctx, ...) joins the trace
http.ListenAndServe(":8080", wizelens.Handler(mux, "inventory")) // server spans, headers, bodies
```

| Call | What it is |
|---|---|
| `Start` | Tracer and logger providers with OTLP over HTTP to `WIZELENS_HUB`, W3C trace context, and sampling that keeps every trace with an error or a slow span |
| `OpenDB`, `DBOptions` | [otelsql](https://github.com/XSAM/otelsql) with one span per query, named by its first word, plus `wizelens.db.parameters` |
| `Handler`, `Capture` | [otelhttp](https://pkg.go.dev/go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp) plus request and response headers and, with `WIZELENS_CAPTURE_BODY=true`, request and response bodies |
| `Transport` | otelhttp's client transport |
| `Logger` | The [otelslog](https://pkg.go.dev/go.opentelemetry.io/contrib/bridges/otelslog) bridge, also writing to your own handler |

`OTEL_EXPORTER_OTLP_ENDPOINT` and the other `OTEL_*` variables still win when you set them.

`Start` takes more options:

| Option | What it does |
|---|---|
| `WithServiceName("inventory")` | The service name when `OTEL_SERVICE_NAME` is not set |
| `WithSettings(s)` | Use these settings instead of the `WIZELENS_*` variables. Start from `wizelens.SettingsFromEnv()` and change fields |
| `WithExporters(spans, logs)` | Send spans and logs to these exporters instead of OTLP, for tests or another backend. Either may be `nil` |

```go
s := wizelens.SettingsFromEnv()
s.SampleRate = 0.25
shutdown, err := wizelens.Start(ctx, wizelens.WithServiceName("inventory"), wizelens.WithSettings(s))
```

## Answers you expect

When a 5xx is on purpose, such as a 503 "come back later", set `wizelens.expected` on the request's server span. WizeLens
then leaves it out of error rates, and the sampler does not keep the trace for that status alone:

```go
import (
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

trace.SpanFromContext(r.Context()).SetAttributes(attribute.Bool("wizelens.expected", true))
```

See [Answers you expect](/docs/dashboard/#answers-you-expect).

## Plain OpenTelemetry

Already set up the SDK yourself? Point it at WizeLens and the insights work on its spans: N+1 queries, N+1 HTTP calls,
slow queries, and database waits.

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:5960
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <token>"   # a shared hub or the cloud
```

Use the OTLP HTTP exporters (`otlptracehttp`, `otlploghttp`). Without parameters on query spans, WizeLens cannot tell
whether two queries had the same values, so it does not call them duplicates. `DBOptions()` adds the parameters to your
own `otelsql.Open` call.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `WIZELENS_HUB` | `http://localhost:5960` | Hub or cloud address |
| `WIZELENS_HUB_TOKEN` | none | Hub token or cloud ingest key |
| `WIZELENS_PROJECT` | none | Project on a shared hub |
| `WIZELENS_SAMPLE_RATE` | `1` | Share of traces kept. See [Sampling](/docs/sampling/) |
| `WIZELENS_KEEP_SLOW_MS` | `1000` | Keep traces with a span this slow at any rate (`off` for none) |
| `WIZELENS_KEEP_ERRORS` | `true` | Keep traces with an error at any rate |
| `WIZELENS_CAPTURE_BODY` | `false` | Request and response bodies (text and JSON, 16 KB) |
| `WIZELENS_CAPTURE_SQL_PARAMETERS` | `true` | SQL parameters, sensitive names redacted |
| `WIZELENS_CAPTURE_HEADERS` | `true` | Request and response headers, secrets redacted (`Set-Cookie` keeps names and flags) |
| `WIZELENS_REDACT_KEYS` | none | More key fragments to redact, comma-separated |
| `WIZELENS_PACKAGES` | `true` | Send the module list once at start, for the known-vulnerability check |
| `WIZELENS_ENABLED` | `true` | `false` makes `Start` do nothing |

The module is on wherever it runs, in development and in production. With `WIZELENS_PACKAGES` on, the hub or the cloud
checks the modules against OSV and shows each vulnerable version on the [Security](/docs/security/#known-vulnerable-packages) page. Only names and versions leave the
app.

## A runnable sample

[`samples/go-net-http`](https://github.com/brandonkorous/wizelens/tree/main/samples/go-net-http) is a `net/http`
service with SQLite. `GET /orders` shows N+1 queries, a duplicate query, and N+1 HTTP calls; `GET /report` shows a slow
query and a database wait; `GET /fail` shows an error with its log line.

```bash
cd samples/go-net-http
WIZELENS_CAPTURE_BODY=true go run .
```
