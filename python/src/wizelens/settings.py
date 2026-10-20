"""WizeLens settings, read from WIZELENS_* environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Mapping, Optional, Tuple

DEFAULT_REDACT_KEYS: Tuple[str, ...] = (
    "authorization",
    "cookie",
    "password",
    "passwd",
    "secret",
    "token",
    "apikey",
    "api_key",
    "connectionstring",
)

BODY_LIMIT = 16 * 1024


def _flag(value: Optional[str], default: bool) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _rate(value: Optional[str]) -> float:
    try:
        rate = float(value) if value else 1.0
    except ValueError:
        return 1.0
    return min(1.0, max(0.0, rate))


def _slow(value: Optional[str]) -> Optional[float]:
    if value is None or value.strip() == "":
        return 1000.0
    if value.strip().lower() in ("off", "none", "null", "false"):
        return None
    try:
        return float(value)
    except ValueError:
        return 1000.0


@dataclass(frozen=True)
class Settings:
    """What WizeLens turns on. Every field has an environment variable."""

    enabled: bool = True
    hub: str = "http://localhost:5960"
    token: Optional[str] = None
    project: Optional[str] = None
    sample_rate: float = 1.0
    keep_errors: bool = True
    keep_slow_ms: Optional[float] = 1000.0
    capture_body: bool = False
    capture_sql_parameters: bool = True
    capture_logs: bool = True
    report_packages: bool = True
    redact_keys: Tuple[str, ...] = field(default=DEFAULT_REDACT_KEYS)

    @staticmethod
    def from_env(env: Optional[Mapping[str, str]] = None) -> "Settings":
        e = os.environ if env is None else env
        extra = tuple(k.strip().lower() for k in e.get("WIZELENS_REDACT_KEYS", "").split(",") if k.strip())
        return Settings(
            enabled=_flag(e.get("WIZELENS_ENABLED"), True),
            hub=(e.get("WIZELENS_HUB") or "http://localhost:5960").rstrip("/"),
            token=e.get("WIZELENS_HUB_TOKEN") or None,
            project=e.get("WIZELENS_PROJECT") or None,
            sample_rate=_rate(e.get("WIZELENS_SAMPLE_RATE")),
            keep_errors=_flag(e.get("WIZELENS_KEEP_ERRORS"), True),
            keep_slow_ms=_slow(e.get("WIZELENS_KEEP_SLOW_MS")),
            capture_body=_flag(e.get("WIZELENS_CAPTURE_BODY"), False),
            capture_sql_parameters=_flag(e.get("WIZELENS_CAPTURE_SQL_PARAMETERS"), True),
            capture_logs=_flag(e.get("WIZELENS_CAPTURE_LOGS"), True),
            report_packages=_flag(e.get("WIZELENS_PACKAGES"), True),
            redact_keys=DEFAULT_REDACT_KEYS + extra,
        )

    def is_sensitive(self, key: str) -> bool:
        k = key.lower()
        return any(s in k for s in self.redact_keys)
