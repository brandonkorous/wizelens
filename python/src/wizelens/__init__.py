"""WizeLens for Python: OpenTelemetry with WizeLens defaults, plus SQL parameters, request bodies, and logs."""

from .asgi import WizeLensMiddleware
from .frameworks import WizeLensDjangoMiddleware, capture_flask
from .sampling import TraceSampler, keep_by_rate
from .settings import Settings
from .setup import WizeLens, configure
from .sql import capture_dbapi_parameters, capture_sqlalchemy_parameters, record_parameters

__version__ = "0.1.0a1"

__all__ = [
    "Settings",
    "TraceSampler",
    "WizeLens",
    "WizeLensDjangoMiddleware",
    "WizeLensMiddleware",
    "capture_dbapi_parameters",
    "capture_flask",
    "capture_sqlalchemy_parameters",
    "configure",
    "keep_by_rate",
    "record_parameters",
]
