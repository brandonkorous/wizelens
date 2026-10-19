"""ASGI middleware (FastAPI, Starlette, Django ASGI) that puts request and response bodies on the server span."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, Optional

from opentelemetry import trace

from .body import REQUEST_BODY, RESPONSE_BODY, BodyBuffer, set_body
from .settings import Settings

Message = Dict[str, Any]


def _header(headers: Any, name: bytes) -> Optional[str]:
    for key, value in headers or []:
        if key.lower() == name:
            return value.decode("latin-1")
    return None


class WizeLensMiddleware:
    """Add it with `app.add_middleware(WizeLensMiddleware)`. It does nothing unless body capture is on."""

    def __init__(self, app: Any, settings: Optional[Settings] = None) -> None:
        self.app = app
        self.settings = settings or Settings.from_env()

    async def __call__(self, scope: Message, receive: Callable[[], Awaitable[Message]], send: Callable[[Message], Awaitable[None]]) -> None:
        if scope.get("type") != "http" or not (self.settings.enabled and self.settings.capture_body):
            await self.app(scope, receive, send)
            return
        span = trace.get_current_span()
        request, response = BodyBuffer(), BodyBuffer()
        state: Dict[str, Any] = {"type": None, "done": False}

        def flush() -> None:
            # The server span can end with the last body chunk, so the bodies go on before it is sent.
            if state["done"]:
                return
            state["done"] = True
            set_body(span, REQUEST_BODY, request, _header(scope.get("headers"), b"content-type"), self.settings)
            set_body(span, RESPONSE_BODY, response, state["type"], self.settings)

        async def receive_body() -> Message:
            message = await receive()
            if message.get("type") == "http.request":
                request.add(message.get("body", b""))
            return message

        async def send_body(message: Message) -> None:
            if message.get("type") == "http.response.start":
                state["type"] = _header(message.get("headers"), b"content-type")
            elif message.get("type") == "http.response.body":
                response.add(message.get("body", b""))
                if not message.get("more_body", False):
                    flush()
            await send(message)

        try:
            await self.app(scope, receive_body, send_body)
        finally:
            flush()
