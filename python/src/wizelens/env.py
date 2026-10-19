"""OpenTelemetry environment defaults that point the SDK and the instrumentations at WizeLens."""

from __future__ import annotations

import os
from typing import Dict, MutableMapping, Optional

from .settings import Settings


def _sanitize_fields(settings: Settings) -> str:
    return ",".join(f".*{k}.*" for k in settings.redact_keys)


def otel_defaults(settings: Settings) -> Dict[str, str]:
    """The OTEL_* values WizeLens sets. A value you set yourself always wins."""
    out = {
        "OTEL_EXPORTER_OTLP_ENDPOINT": settings.hub,
        "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
        "OTEL_TRACES_EXPORTER": "otlp",
        "OTEL_METRICS_EXPORTER": "otlp",
        "OTEL_LOGS_EXPORTER": "otlp",
        # WizeLens samples at the end of each trace, so the head sampler keeps everything.
        "OTEL_TRACES_SAMPLER": "parentbased_always_on",
        "OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_REQUEST": ".*",
        "OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_RESPONSE": ".*",
        "OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SANITIZE_FIELDS": _sanitize_fields(settings),
        # WizeLens adds its own log handler (with sampling), so the logging instrumentation must not add a second one.
        "OTEL_PYTHON_LOG_AUTO_INSTRUMENTATION": "false",
    }
    if settings.token:
        out["OTEL_EXPORTER_OTLP_HEADERS"] = f"Authorization=Bearer {settings.token}"
    return out


def _with_project(current: Optional[str], project: Optional[str]) -> Optional[str]:
    if not project or (current and "wizelens.project=" in current):
        return current
    pair = f"wizelens.project={project}"
    return f"{current},{pair}" if current else pair


def apply_otel_defaults(settings: Settings, env: Optional[MutableMapping[str, str]] = None) -> None:
    """Write the defaults into the environment, keeping every value that is already set."""
    e = os.environ if env is None else env
    for key, value in otel_defaults(settings).items():
        e.setdefault(key, value)
    resource = _with_project(e.get("OTEL_RESOURCE_ATTRIBUTES"), settings.project)
    if resource:
        e["OTEL_RESOURCE_ATTRIBUTES"] = resource
