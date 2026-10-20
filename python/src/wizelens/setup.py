"""Builds the OpenTelemetry providers with WizeLens defaults: OTLP to the hub or cloud, tail sampling, logs, SQL parameters."""

from __future__ import annotations

import logging
import os
from typing import Any, List, Optional

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from .env import apply_otel_defaults
from .packages import report_packages
from .processors import SamplingLogProcessor, SamplingSpanProcessor
from .sampling import TraceSampler
from .settings import Settings
from .sql import capture_dbapi_parameters, capture_sqlalchemy_parameters


class WizeLens:
    """What `configure()` set up. Call `shutdown()` before the process exits to send what is left."""

    def __init__(self, settings: Settings, sampler: TraceSampler, providers: List[Any]) -> None:
        self.settings = settings
        self.sampler = sampler
        self._providers = providers

    def shutdown(self) -> None:
        for provider in self._providers:
            provider.shutdown()


def _on(signal: str) -> bool:
    return os.environ.get(f"OTEL_{signal}_EXPORTER", "otlp").strip().lower() != "none"


def _traces(settings: Settings, sampler: TraceSampler, resource: Resource, exporter: Any) -> TracerProvider:
    if exporter is None:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        exporter = OTLPSpanExporter()
    provider = TracerProvider(resource=resource)
    batch = BatchSpanProcessor(exporter)
    provider.add_span_processor(SamplingSpanProcessor(batch, sampler, settings.keep_errors, settings.keep_slow_ms))
    trace.set_tracer_provider(provider)
    return provider


def _handler_class() -> Any:
    try:
        from opentelemetry.instrumentation.logging.handler import LoggingHandler
    except ImportError:
        from opentelemetry.sdk._logs import LoggingHandler
    return LoggingHandler


def _logs(settings: Settings, sampler: TraceSampler, resource: Resource, exporter: Any) -> Any:
    from opentelemetry._logs import set_logger_provider
    from opentelemetry.sdk._logs import LoggerProvider
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

    LoggingHandler = _handler_class()

    if exporter is None:
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter

        exporter = OTLPLogExporter()
    provider = LoggerProvider(resource=resource)
    provider.add_log_record_processor(SamplingLogProcessor(BatchLogRecordProcessor(exporter), sampler, settings.keep_errors))
    set_logger_provider(provider)
    root = logging.getLogger()
    if not any(isinstance(h, LoggingHandler) for h in root.handlers):
        handler = LoggingHandler(level=logging.NOTSET, logger_provider=provider)
        root.addHandler(handler)
        _keep_handler(handler)
    return provider


def _keep_handler(handler: logging.Handler) -> None:
    """basicConfig, dictConfig, and fileConfig still work: the WizeLens handler steps aside while they run, then comes back."""
    import logging.config

    root = logging.getLogger()

    def wrap(fn: Any) -> Any:
        def run(*args: Any, **kwargs: Any) -> Any:
            present = handler in root.handlers
            if present:
                root.removeHandler(handler)
            try:
                return fn(*args, **kwargs)
            finally:
                if present:
                    root.addHandler(handler)

        return run

    logging.basicConfig = wrap(logging.basicConfig)
    logging.config.dictConfig = wrap(logging.config.dictConfig)
    logging.config.fileConfig = wrap(logging.config.fileConfig)


def _metrics(resource: Resource) -> Any:
    from opentelemetry import metrics
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

    provider = MeterProvider(resource=resource, metric_readers=[PeriodicExportingMetricReader(OTLPMetricExporter())])
    metrics.set_meter_provider(provider)
    return provider


def configure(settings: Optional[Settings] = None, service_name: Optional[str] = None, span_exporter: Any = None, log_exporter: Any = None) -> Optional[WizeLens]:
    """Set up OpenTelemetry for WizeLens. `opentelemetry-instrument` calls this for you; call it yourself without it."""
    s = settings or Settings.from_env()
    if not s.enabled:
        return None
    apply_otel_defaults(s)
    if service_name:
        os.environ.setdefault("OTEL_SERVICE_NAME", service_name)
    resource = Resource.create()
    sampler = TraceSampler(s.sample_rate)
    providers: List[Any] = []
    if span_exporter is not None or _on("TRACES"):
        providers.append(_traces(s, sampler, resource, span_exporter))
    if s.capture_logs and (log_exporter is not None or _on("LOGS")):
        providers.append(_logs(s, sampler, resource, log_exporter))
    if span_exporter is None and _on("METRICS"):
        providers.append(_metrics(resource))
    if s.capture_sql_parameters:
        capture_dbapi_parameters(s)
        capture_sqlalchemy_parameters(s)
    if s.report_packages and span_exporter is None:
        report_packages(s, resource.attributes)
    return WizeLens(s, sampler, providers)
