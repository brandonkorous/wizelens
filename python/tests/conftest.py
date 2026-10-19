import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from wizelens import Settings

_EXPORTER = InMemorySpanExporter()
_PROVIDER = TracerProvider()
_PROVIDER.add_span_processor(SimpleSpanProcessor(_EXPORTER))
trace.set_tracer_provider(_PROVIDER)


@pytest.fixture
def spans():
    """Spans ended during the test, from the one global provider."""
    _EXPORTER.clear()
    yield _EXPORTER
    _EXPORTER.clear()


@pytest.fixture
def provider():
    return _PROVIDER


@pytest.fixture
def body_on():
    return Settings.from_env({"WIZELENS_CAPTURE_BODY": "true"})
