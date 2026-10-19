"""Span and log processors that run the WizeLens sampler in front of the exporters."""

from __future__ import annotations

from typing import Any, Optional

from opentelemetry.sdk.trace import ReadableSpan, SpanProcessor
from opentelemetry.trace import StatusCode

from .sampling import TraceSampler, is_slow

_ERROR_SEVERITY = 17


class SamplingSpanProcessor(SpanProcessor):
    """Holds the spans of a trace outside the rate until its local root ends; sends them on when the trace is kept."""

    def __init__(self, inner: SpanProcessor, sampler: TraceSampler, keep_errors: bool = True, keep_slow_ms: Optional[float] = 1000.0) -> None:
        self._inner = inner
        self._sampler = sampler
        self._keep_errors = keep_errors
        self._keep_slow_ms = keep_slow_ms

    def on_start(self, span: Any, parent_context: Any = None) -> None:
        self._inner.on_start(span, parent_context=parent_context)

    def on_end(self, span: ReadableSpan) -> None:
        ctx = span.get_span_context()
        if ctx is None:
            return
        parent = span.parent
        root = parent is None or parent.is_remote
        self._sampler.offer(format(ctx.trace_id, "032x"), self._important(span), root, lambda: self._inner.on_end(span))

    def _important(self, span: ReadableSpan) -> bool:
        if self._keep_errors and span.status.status_code is StatusCode.ERROR:
            return True
        if span.start_time is None or span.end_time is None:
            return False
        return is_slow((span.end_time - span.start_time) / 1e6, self._keep_slow_ms)

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)


class SamplingLogProcessor:
    """Log lines follow their trace: kept, held, or dropped with it. An error line keeps the trace."""

    def __init__(self, inner: Any, sampler: TraceSampler, keep_errors: bool = True) -> None:
        self._inner = inner
        self._sampler = sampler
        self._keep_errors = keep_errors

    def on_emit(self, log_data: Any) -> None:
        record = getattr(log_data, "log_record", log_data)
        trace_id = getattr(record, "trace_id", 0) or 0
        if not trace_id:
            self._inner.on_emit(log_data)
            return
        severity = getattr(getattr(record, "severity_number", None), "value", 0) or 0
        important = self._keep_errors and severity >= _ERROR_SEVERITY
        self._sampler.offer(format(trace_id, "032x"), important, False, lambda: self._inner.on_emit(log_data))

    def emit(self, log_data: Any) -> None:
        self.on_emit(log_data)

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)
