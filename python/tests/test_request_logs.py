import logging
from types import SimpleNamespace

from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter, SimpleLogRecordProcessor
from opentelemetry.sdk.trace import TracerProvider

from wizelens.distro import WizeLensDistro
from wizelens.request_logs import keep_span, with_request_span
from wizelens.setup import _handler_class


def test_a_line_logged_after_the_request_span_closes_joins_that_request():
    tracer = TracerProvider().get_tracer("test")
    logs = InMemoryLogRecordExporter()
    provider = LoggerProvider()
    provider.add_log_record_processor(SimpleLogRecordProcessor(logs))
    log = logging.getLogger("wizelens.test.request_logs")
    log.addHandler(with_request_span(_handler_class())(level=logging.NOTSET, logger_provider=provider))
    log.setLevel(logging.INFO)
    request = SimpleNamespace(path="/checkout")
    with tracer.start_as_current_span("POST /checkout") as span:
        keep_span(span, request)
    # Django's log_response runs here: after the middleware closed the span.
    log.warning("Conflict: %s", request.path, extra={"request": request})
    log.warning("No request named")
    got = {str(r.log_record.body): r.log_record.trace_id for r in logs.get_finished_logs()}
    assert got["Conflict: /checkout"] == span.get_span_context().trace_id
    assert not got["No request named"]


def test_the_distro_hands_django_the_hook():
    seen = {}

    class EntryPoint:
        name = "django"

        def load(self):
            return lambda: SimpleNamespace(instrument=lambda **kw: seen.update(kw))

    WizeLensDistro().load_instrumentor(EntryPoint())
    assert seen["request_hook"] is keep_span
