"""SQL parameters on database spans, which the OpenTelemetry instrumentations leave out."""

from __future__ import annotations

import datetime
import decimal
import json
import uuid
from typing import Any, Optional

from opentelemetry import trace

from .settings import Settings

PARAMS_ATTR = "wizelens.db.parameters"
REDACTED = "[redacted]"
_patched = {"dbapi": False, "sqlalchemy": False}


def _plain(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f"<{len(bytes(value))} bytes>"
    if isinstance(value, (datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, (decimal.Decimal, uuid.UUID)):
        return str(value)
    return repr(value)


def params_json(params: Any, settings: Settings) -> Optional[str]:
    """Parameters as the `wizelens.db.parameters` JSON text: sensitive names redacted, positions kept."""
    if params is None:
        return None
    if isinstance(params, dict):
        named = {str(k): REDACTED if settings.is_sensitive(str(k)) else _plain(v) for k, v in params.items()}
        return json.dumps(named)
    if isinstance(params, (list, tuple)):
        return json.dumps([_plain(v) for v in params])
    return json.dumps([_plain(params)])


def record_parameters(params: Any, span: Any = None, settings: Optional[Settings] = None) -> None:
    """Put parameters on a span (the current one by default). For drivers WizeLens does not patch."""
    target = span or trace.get_current_span()
    text = params_json(params, settings or Settings.from_env())
    if text is not None and target.is_recording():
        target.set_attribute(PARAMS_ATTR, text)


def capture_dbapi_parameters(settings: Settings) -> bool:
    """Every DB-API driver the OpenTelemetry dbapi instrumentation covers (sqlite3, psycopg, PyMySQL, ...)."""
    if _patched["dbapi"]:
        return True
    try:
        from opentelemetry.instrumentation.dbapi import CursorTracer
    except ImportError:
        return False
    original = CursorTracer._populate_span

    def _populate_span(self: Any, span: Any, cursor: Any, *args: Any) -> None:
        original(self, span, cursor, *args)
        if len(args) > 1 and span.is_recording():
            text = params_json(args[1], settings)
            if text is not None:
                span.set_attribute(PARAMS_ATTR, text)

    CursorTracer._populate_span = _populate_span
    _trace_connection_shortcuts()
    _patched["dbapi"] = True
    return True


def _trace_connection_shortcuts() -> None:
    """`connection.execute()` (sqlite3, psycopg 3) skips the traced cursor; route it through one."""
    try:
        from opentelemetry.instrumentation.dbapi import TracedConnectionProxy
    except ImportError:
        return

    def execute(self: Any, *args: Any, **kwargs: Any) -> Any:
        return self.cursor().execute(*args, **kwargs)

    def executemany(self: Any, *args: Any, **kwargs: Any) -> Any:
        return self.cursor().executemany(*args, **kwargs)

    TracedConnectionProxy.execute = execute
    TracedConnectionProxy.executemany = executemany


def capture_sqlalchemy_parameters(settings: Settings) -> bool:
    """SQLAlchemy engines: the parameters go on the span the SQLAlchemy instrumentation opened."""
    if _patched["sqlalchemy"]:
        return True
    try:
        from sqlalchemy import event
        from sqlalchemy.engine import Engine
    except ImportError:
        return False

    def _after(conn: Any, cursor: Any, statement: Any, parameters: Any, context: Any, executemany: bool) -> None:
        span = getattr(context, "_otel_span", None)
        if span is None or not span.is_recording() or not parameters:
            return
        # The bound names (compiled_parameters) let sensitive ones be redacted; the driver only sees positions.
        named = getattr(context, "compiled_parameters", None)
        text = params_json(named[0] if named and len(named) == 1 else parameters, settings)
        if text is not None:
            span.set_attribute(PARAMS_ATTR, text)

    event.listen(Engine, "after_cursor_execute", _after, insert=True)
    _patched["sqlalchemy"] = True
    return True
