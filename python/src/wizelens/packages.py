"""The PyPI packages this process runs, sent to the hub once at start for the known-vulnerability check."""

from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from importlib import metadata
from typing import Any, Dict, List, Mapping

from .settings import Settings

MAX_PACKAGES = 5000
RETRIES = 5
RETRY_SECONDS = 60.0


def list_packages() -> List[Dict[str, str]]:
    """Every installed distribution once per name and version, at most MAX_PACKAGES."""
    found: Dict[str, Dict[str, str]] = {}
    for dist in metadata.distributions():
        name = (dist.metadata["Name"] or "").strip()
        version = (dist.version or "").strip()
        if name and version and len(found) < MAX_PACKAGES:
            found[f"{name.lower()}@{version}"] = {"ecosystem": "PyPI", "name": name, "version": version}
    return list(found.values())


def sender_of(settings: Settings, resource: Mapping[str, Any]) -> Dict[str, Any]:
    """The HubSender of the report, from the OpenTelemetry resource."""
    out = {"service": str(resource.get("service.name") or "unknown_service"), "runtime": "otlp python"}
    if settings.project:
        out["project"] = settings.project
    if resource.get("service.version"):
        out["release"] = str(resource["service.version"])
    env = resource.get("deployment.environment.name") or resource.get("deployment.environment")
    if env:
        out["environment"] = str(env)
    return out


def _post(settings: Settings, body: bytes) -> bool:
    headers = {"Content-Type": "application/json"}
    if settings.token:
        headers["Authorization"] = f"Bearer {settings.token}"
    req = urllib.request.Request(f"{settings.hub}/_wizelens/api/packages", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10):
            return True
    except urllib.error.HTTPError as e:
        return 400 <= e.code < 500 and e.code != 429
    except (urllib.error.URLError, OSError):
        return False


def report_packages(settings: Settings, resource: Mapping[str, Any]) -> threading.Thread:
    """Send the list from a background thread, retrying a few times while the hub cannot be reached. Never raises."""

    def run() -> None:
        try:
            body = json.dumps({"sender": sender_of(settings, resource), "packages": list_packages()}).encode()
            for _ in range(RETRIES):
                if _post(settings, body):
                    return
                time.sleep(RETRY_SECONDS)
        except Exception:  # noqa: BLE001 - reporting must never break the app
            return

    thread = threading.Thread(target=run, name="wizelens-packages", daemon=True)
    thread.start()
    return thread
