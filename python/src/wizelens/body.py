"""Request and response body previews: text and JSON only, the first 16 KB, sensitive JSON keys redacted."""

from __future__ import annotations

import json
from typing import Any, Optional

from .settings import BODY_LIMIT, Settings

REQUEST_BODY = "wizelens.request.body"
RESPONSE_BODY = "wizelens.response.body"
REDACTED = "[redacted]"
_TEXT_TYPES = ("application/json", "application/xml", "application/x-www-form-urlencoded", "application/graphql")


def is_text(content_type: Optional[str]) -> bool:
    """True for text and JSON bodies, the ones WizeLens keeps."""
    if not content_type:
        return False
    t = content_type.split(";")[0].strip().lower()
    return t.startswith("text/") or t in _TEXT_TYPES or t.endswith("+json") or t.endswith("+xml")


class BodyBuffer:
    """Keeps the first `limit` bytes of a body and notes when there was more."""

    def __init__(self, limit: int = BODY_LIMIT) -> None:
        self.limit = limit
        self.data = bytearray()
        self.truncated = False

    def add(self, chunk: bytes) -> None:
        if not chunk:
            return
        room = self.limit - len(self.data)
        if room > 0:
            self.data.extend(chunk[:room])
        if len(chunk) > room:
            self.truncated = True


def _redact(value: Any, settings: Settings) -> Any:
    if isinstance(value, dict):
        return {k: REDACTED if settings.is_sensitive(str(k)) else _redact(v, settings) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v, settings) for v in value]
    return value


def preview(data: bytes, truncated: bool, settings: Settings) -> str:
    """The body as text. Complete JSON has its sensitive keys redacted."""
    text = data.decode("utf-8", errors="replace")
    if truncated:
        return text
    try:
        return json.dumps(_redact(json.loads(text), settings), ensure_ascii=False)
    except ValueError:
        return text


def set_body(span: Any, key: str, buf: BodyBuffer, content_type: Optional[str], settings: Settings) -> None:
    """Put a body preview on a span, when the body is text and not empty."""
    if not buf.data or not is_text(content_type) or not span.is_recording():
        return
    span.set_attribute(key, preview(bytes(buf.data), buf.truncated, settings))
    if buf.truncated:
        span.set_attribute(f"{key}.truncated", True)
