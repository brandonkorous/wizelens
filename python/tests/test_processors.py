import logging
import time

from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter, SimpleLogRecordProcessor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import Status, StatusCode

from wizelens.processors import SamplingLogProcessor, SamplingSpanProcessor
from wizelens.sampling import TraceSampler
from wizelens.setup import _handler_class


def _tracer(sampler, keep_slow_ms=50.0):
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SamplingSpanProcessor(SimpleSpanProcessor(exporter), sampler, True, keep_slow_ms))
    return provider.get_tracer("test"), exporter


def _names(exporter):
    return sorted(s.name for s in exporter.get_finished_spans())


def test_rate_zero_drops_a_quiet_trace():
    tracer, exporter = _tracer(TraceSampler(0))
    with tracer.start_as_current_span("GET /orders"):
        with tracer.start_as_current_span("SELECT orders"):
            pass
    assert _names(exporter) == []


def test_rate_zero_keeps_a_trace_with_an_error():
    tracer, exporter = _tracer(TraceSampler(0))
    with tracer.start_as_current_span("GET /orders"):
        with tracer.start_as_current_span("SELECT orders"):
            pass
        with tracer.start_as_current_span("charge") as span:
            span.set_status(Status(StatusCode.ERROR))
    assert _names(exporter) == ["GET /orders", "SELECT orders", "charge"]


def test_rate_zero_drops_a_trace_that_only_answered_4xx():
    tracer, exporter = _tracer(TraceSampler(0))
    with tracer.start_as_current_span("GET /firebase-key.json") as span:
        span.set_attribute("http.response.status_code", 404)
        span.set_status(Status(StatusCode.ERROR))
    assert _names(exporter) == []


def test_rate_zero_keeps_a_slow_trace():
    tracer, exporter = _tracer(TraceSampler(0), keep_slow_ms=20.0)
    with tracer.start_as_current_span("GET /report"):
        with tracer.start_as_current_span("SELECT big"):
            pass
        time.sleep(0.03)
    assert _names(exporter) == ["GET /report", "SELECT big"]


def test_full_rate_sends_everything():
    tracer, exporter = _tracer(TraceSampler(1))
    with tracer.start_as_current_span("GET /"):
        pass
    assert _names(exporter) == ["GET /"]


def test_logs_follow_their_trace():
    sampler = TraceSampler(0)
    tracer, spans = _tracer(sampler)
    logs = InMemoryLogRecordExporter()
    provider = LoggerProvider()
    provider.add_log_record_processor(SamplingLogProcessor(SimpleLogRecordProcessor(logs), sampler))
    log = logging.getLogger("wizelens.test.logs")
    log.addHandler(_handler_class()(level=logging.NOTSET, logger_provider=provider))
    log.setLevel(logging.INFO)
    with tracer.start_as_current_span("quiet"):
        log.info("dropped with its trace")
    with tracer.start_as_current_span("loud"):
        log.info("held, then kept")
        log.error("an error keeps the trace")
    bodies = sorted(str(r.log_record.body) for r in logs.get_finished_logs())
    assert bodies == ["an error keeps the trace", "held, then kept"]
    assert _names(spans) == ["loud"]
