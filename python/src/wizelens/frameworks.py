"""Body capture for Flask and Django, which run inside the server span the OpenTelemetry instrumentation opened."""

from __future__ import annotations

from typing import Any, Callable, Optional

from opentelemetry import trace

from .body import REQUEST_BODY, RESPONSE_BODY, BodyBuffer, set_body
from .settings import Settings


def _buffer(data: bytes) -> BodyBuffer:
    buf = BodyBuffer()
    buf.add(data)
    return buf


def capture_flask(app: Any, settings: Optional[Settings] = None) -> Any:
    """`wizelens.capture_flask(app)`: request and response bodies on the Flask server span."""
    s = settings or Settings.from_env()
    if not (s.enabled and s.capture_body):
        return app

    @app.after_request
    def _wizelens_body(response: Any) -> Any:
        from flask import request

        span = trace.get_current_span()
        set_body(span, REQUEST_BODY, _buffer(request.get_data(cache=True)), request.content_type, s)
        if not response.is_streamed:
            set_body(span, RESPONSE_BODY, _buffer(response.get_data()), response.content_type, s)
        return response

    return app


class WizeLensDjangoMiddleware:
    """Add `"wizelens.frameworks.WizeLensDjangoMiddleware"` to MIDDLEWARE, after the OpenTelemetry one."""

    def __init__(self, get_response: Callable[[Any], Any], settings: Optional[Settings] = None) -> None:
        self.get_response = get_response
        self.settings = settings or Settings.from_env()

    def __call__(self, request: Any) -> Any:
        if not (self.settings.enabled and self.settings.capture_body):
            return self.get_response(request)
        body = request.body
        response = self.get_response(request)
        span = trace.get_current_span()
        set_body(span, REQUEST_BODY, _buffer(body), request.META.get("CONTENT_TYPE"), self.settings)
        if not getattr(response, "streaming", False):
            set_body(span, RESPONSE_BODY, _buffer(response.content), response.get("Content-Type"), self.settings)
        return response
