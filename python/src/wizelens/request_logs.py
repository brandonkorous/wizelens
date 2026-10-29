"""Django logs a 4xx after its request span has closed; these tie that line back to the request it is about."""

from __future__ import annotations

from typing import Any, Optional

from opentelemetry import trace

_SPAN = "_wizelens_span"


def keep_span(span: Any, request: Any) -> None:
    """Django `request_hook`: keep the server span on the request, for lines logged after it closes."""
    try:
        setattr(request, _SPAN, span)
    except AttributeError:
        pass


def request_span(record: Any) -> Optional[Any]:
    """The server span of the request a log line names (Django passes `request=`), if it was kept."""
    return getattr(getattr(record, "request", None), _SPAN, None)


def with_request_span(handler_class: Any) -> Any:
    """A log handler that gives a line outside any span the span of the request it names."""

    class RequestSpanHandler(handler_class):  # type: ignore[misc, valid-type]
        def emit(self, record: Any) -> None:
            span = None if trace.get_current_span().get_span_context().is_valid else request_span(record)
            if span is None:
                super().emit(record)
                return
            with trace.use_span(span, end_on_exit=False):
                super().emit(record)

    return RequestSpanHandler
