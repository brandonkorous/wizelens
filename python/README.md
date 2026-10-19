# WizeLens for Python

OpenTelemetry auto-instrumentation with WizeLens defaults, plus the detail the agents leave out: SQL parameters,
request and response bodies, and logs. It sends OTLP to a [WizeLens](https://wizelens.com) hub or the cloud.

```bash
pip install wizelens
opentelemetry-bootstrap -a install          # instrumentations for the libraries you use
OTEL_SERVICE_NAME=orders-api opentelemetry-instrument uvicorn app:app
```

`opentelemetry-instrument` finds WizeLens on its own. It points the SDK at `http://localhost:5960` (the hub), keeps
every trace with an error or a slow span when you sample, sends logs with their trace, and puts SQL parameters on
database spans.

| Variable | Default | What it does |
|---|---|---|
| `WIZELENS_HUB` | `http://localhost:5960` | Hub or cloud address |
| `WIZELENS_HUB_TOKEN` | none | Hub token or cloud ingest key |
| `WIZELENS_PROJECT` | none | Project name on a shared hub |
| `WIZELENS_SAMPLE_RATE` | `1` | Share of traces kept, 0 to 1 |
| `WIZELENS_KEEP_SLOW_MS` | `1000` | Keep traces with a span this slow (`off` for none) |
| `WIZELENS_CAPTURE_BODY` | `false` | Request and response bodies (text and JSON, 16 KB) |
| `WIZELENS_CAPTURE_SQL_PARAMETERS` | `true` | SQL parameters, sensitive names redacted |

Bodies need one line: `app.add_middleware(WizeLensMiddleware)` (FastAPI, Starlette), `capture_flask(app)` (Flask),
or `wizelens.frameworks.WizeLensDjangoMiddleware` (Django).

Full guide: https://wizelens.com/docs/python/
