"""Hooks for `opentelemetry-instrument`: the distro sets WizeLens defaults, the configurator builds the providers."""

from __future__ import annotations

import os
from typing import Any

from opentelemetry.instrumentation.distro import BaseDistro
from opentelemetry.sdk._configuration import _BaseConfigurator

from .env import apply_otel_defaults
from .settings import Settings


class WizeLensDistro(BaseDistro):
    """Runs first: points the OpenTelemetry SDK and instrumentations at WizeLens."""

    def _configure(self, **kwargs: Any) -> None:
        settings = Settings.from_env()
        if not settings.enabled:
            os.environ.setdefault("OTEL_SDK_DISABLED", "true")
            return
        apply_otel_defaults(settings)

    def load_instrumentor(self, entry_point: Any, **kwargs: Any) -> None:
        # FastAPI's per-message "http send" and "http receive" spans are noise in WizeLens.
        if entry_point.name == "fastapi":
            kwargs.setdefault("exclude_spans", ["receive", "send"])
        # Django logs a 4xx after the span closes; keeping the span on the request ties that line to it.
        if entry_point.name == "django":
            from .request_logs import keep_span

            kwargs.setdefault("request_hook", keep_span)
        super().load_instrumentor(entry_point, **kwargs)


class WizeLensConfigurator(_BaseConfigurator):
    """Runs before the instrumentations: tail sampling, log capture, and SQL parameters."""

    def _configure(self, **kwargs: Any) -> None:
        from .setup import configure

        configure()
