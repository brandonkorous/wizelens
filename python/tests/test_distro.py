import os
from importlib.metadata import entry_points

import pytest

from wizelens import Settings, configure
from wizelens.distro import WizeLensConfigurator, WizeLensDistro


@pytest.fixture(autouse=True)
def _restore_env():
    saved = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(saved)


def test_opentelemetry_instrument_finds_wizelens():
    distros = {e.name: e.value for e in entry_points(group="opentelemetry_distro")}
    configurators = {e.name: e.value for e in entry_points(group="opentelemetry_configurator")}
    assert distros["wizelens"] == "wizelens.distro:WizeLensDistro"
    assert configurators["wizelens"] == "wizelens.distro:WizeLensConfigurator"
    assert WizeLensConfigurator is not None


def test_the_distro_sets_defaults(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.setenv("WIZELENS_ENDPOINT", "http://hub:5960")
    monkeypatch.setenv("WIZELENS_TOKEN", "abc")
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_HEADERS", raising=False)
    WizeLensDistro().configure()

    assert os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://hub:5960"
    assert os.environ["OTEL_EXPORTER_OTLP_HEADERS"] == "Authorization=Bearer abc"


def test_turned_off_does_nothing(monkeypatch):
    monkeypatch.delenv("OTEL_SDK_DISABLED", raising=False)
    assert configure(Settings.from_env({"WIZELENS_ENABLED": "false"})) is None
    monkeypatch.setenv("WIZELENS_ENABLED", "false")
    WizeLensDistro().configure()

    assert os.environ["OTEL_SDK_DISABLED"] == "true"
