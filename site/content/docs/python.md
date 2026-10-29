---
title: Python
description: opentelemetry-instrument with WizeLens defaults. N+1 queries, slow queries, SQL parameters, request bodies, and logs for FastAPI, Flask, and Django.
---

## Start with opentelemetry-instrument

Python apps send to WizeLens through [OpenTelemetry auto-instrumentation](https://opentelemetry.io/docs/zero-code/python/).
It traces FastAPI, Flask, Django, SQLAlchemy, psycopg, sqlite3, requests, httpx, and more, with no code change.
Requires Python 3.10 or newer.

> **Install from GitHub:** the first release of `wizelens` is not on PyPI yet. Until it is, install it from GitHub:
> `pip install "wizelens @ git+https://github.com/brandonkorous/wizelens#subdirectory=python"`. The commands below then
> work as written.

```bash
pip install wizelens
opentelemetry-bootstrap -a install          # instrumentations for the libraries you use
OTEL_SERVICE_NAME=orders-api opentelemetry-instrument uvicorn app:app
```

For Django, name the settings in the environment and turn off the reloader. Without `DJANGO_SETTINGS_MODULE`, the
instrumentation loads Django first and it stops with "You must set settings.ALLOWED_HOSTS". Under Gunicorn or
uWSGI, run `opentelemetry-instrument gunicorn shop.wsgi` the same way.

```bash
DJANGO_SETTINGS_MODULE=shop.settings OTEL_SERVICE_NAME=shop opentelemetry-instrument python manage.py runserver --noreload
```

`opentelemetry-instrument` finds the `wizelens` package on its own: it is an OpenTelemetry distro and configurator.
Do not also install `opentelemetry-distro`. If you must, set `OTEL_PYTHON_DISTRO=wizelens` and
`OTEL_PYTHON_CONFIGURATOR=wizelens`.

The insights work on what the instrumentations send: N+1 queries, N+1 HTTP calls, slow queries, and database waits.

## What the package adds

| What | Plain OpenTelemetry | With `wizelens` |
|---|---|---|
| Where it sends | You set `OTEL_EXPORTER_OTLP_ENDPOINT` | `WIZELENS_HUB`, else `http://localhost:5960` |
| Sampling | Head sampling: errors can be dropped | Keeps every trace with an error or a slow span |
| SQL parameters | None, so no duplicate-query insight | On every DB-API driver and SQLAlchemy, sensitive names redacted |
| `connection.execute()` (sqlite3, psycopg 3) | Not traced | Traced |
| Logs | Off unless you turn them on | Every `logging` line, with its trace |
| Metrics | You set `OTEL_METRICS_EXPORTER` | Sent with traces and logs (`OTEL_METRICS_EXPORTER=otlp`) |
| Request and response headers | Off | On, secrets redacted, `Set-Cookie` names and flags kept |
| FastAPI | A span per message sent | One server span per request |

Anything you set yourself with `OTEL_*` wins.

## Request and response bodies

Add one line for your framework, then set `WIZELENS_CAPTURE_BODY=true`:

| Framework | Code |
|---|---|
| FastAPI, Starlette | `app.add_middleware(WizeLensMiddleware)` (`from wizelens import WizeLensMiddleware`) |
| Flask | `capture_flask(app)` (`from wizelens import capture_flask`) |
| Django | Add `"wizelens.frameworks.WizeLensDjangoMiddleware"` to `MIDDLEWARE` (the instrumentation puts its own first) |

Text and JSON bodies are kept, up to 16 KB each. JSON keys that look like secrets are redacted.

## Without opentelemetry-instrument

```python
import wizelens

wizelens.configure(service_name="orders-api")   # before your app imports its libraries
```

Then instrument libraries yourself, for example `FastAPIInstrumentor.instrument_app(app)`. For a driver WizeLens does
not patch, put the parameters on the span with `wizelens.record_parameters(params)`.

`configure` also takes `settings=wizelens.Settings(...)` to set values in code instead of `WIZELENS_*` variables. If you set
up OpenTelemetry yourself without `configure`, `wizelens.capture_dbapi_parameters(settings)` and
`wizelens.capture_sqlalchemy_parameters(settings)` put SQL parameters on the DB-API and SQLAlchemy spans.

## Answers you expect

When a 5xx is on purpose, such as a 503 "come back later", set `wizelens.expected` on the request's server span. WizeLens
then leaves it out of error rates, and the sampler does not keep the trace for that status alone:

```python
from opentelemetry import trace

trace.get_current_span().set_attribute("wizelens.expected", True)
```

See [Answers you expect](/docs/dashboard/#answers-you-expect).

## Settings

| Variable | Default | What it does |
|---|---|---|
| `WIZELENS_HUB` | `http://localhost:5960` | Hub or cloud address |
| `WIZELENS_HUB_TOKEN` | none | Hub token or cloud ingest key |
| `WIZELENS_PROJECT` | none | Project on a shared hub |
| `WIZELENS_SAMPLE_RATE` | `1` | Share of traces kept. See [Sampling](/docs/sampling/) |
| `WIZELENS_KEEP_SLOW_MS` | `1000` | Keep traces with a span this slow at any rate (`off` for none) |
| `WIZELENS_KEEP_ERRORS` | `true` | Keep traces with an error at any rate |
| `WIZELENS_CAPTURE_BODY` | `false` | Request and response bodies |
| `WIZELENS_CAPTURE_SQL_PARAMETERS` | `true` | SQL parameters |
| `WIZELENS_CAPTURE_LOGS` | `true` | `logging` lines |
| `WIZELENS_REDACT_KEYS` | none | More key fragments to redact, comma-separated |
| `WIZELENS_PACKAGES` | `true` | Send the app's package names and versions once at start, for the known-vulnerability check |
| `WIZELENS_ENABLED` | `true` | `false` turns OpenTelemetry off |

The package is on wherever it runs, in development and in production. With `WIZELENS_PACKAGES` on, the hub or the cloud
checks the packages against OSV and shows each vulnerable version on the [Security](/docs/security/#known-vulnerable-packages) page. Only names and versions leave the
app.

## A runnable sample

[`samples/python-fastapi`](https://github.com/brandonkorous/wizelens/tree/main/samples/python-fastapi) is a FastAPI
service with SQLite. `GET /orders` shows N+1 queries, a duplicate query, and N+1 HTTP calls to the Go sample;
`GET /report` shows a slow query and a database wait; `GET /fail` shows an error with its log line.

```bash
cd samples/python-fastapi
pip install -r requirements.txt && opentelemetry-bootstrap -a install
OTEL_SERVICE_NAME=orders-python WIZELENS_CAPTURE_BODY=true opentelemetry-instrument uvicorn app:app --port 5302
```
