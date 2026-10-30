import logging
import re

from wizelens import Settings
from wizelens.env import apply_otel_defaults, otel_defaults
from wizelens.settings import env_flag


def test_defaults():
    s = Settings.from_env({})
    assert s.enabled and s.endpoint == "http://localhost:5960" and s.sample_rate == 1.0
    assert s.keep_errors and s.keep_slow_ms == 1000.0
    assert not s.capture_body and s.capture_sql_parameters and s.capture_logs


def test_reads_the_wizelens_variables():
    s = Settings.from_env({
        "WIZELENS_ENDPOINT": "https://app.wizelens.com/",
        "WIZELENS_TOKEN": "wl_ik_1",
        "WIZELENS_PROJECT": "shop",
        "WIZELENS_SAMPLE_RATE": "0.25",
        "WIZELENS_KEEP_SLOW_MS": "off",
        "WIZELENS_CAPTURE_BODY": "true",
        "WIZELENS_REDACT_KEYS": "ssn, card",
    })
    assert s.endpoint == "https://app.wizelens.com" and s.token == "wl_ik_1" and s.project == "shop"
    assert s.sample_rate == 0.25 and s.keep_slow_ms is None and s.capture_body
    assert s.is_sensitive("customer_SSN") and s.is_sensitive("Password") and not s.is_sensitive("name")


def test_bad_rate_keeps_everything():
    assert Settings.from_env({"WIZELENS_SAMPLE_RATE": "lots"}).sample_rate == 1.0
    assert Settings.from_env({"WIZELENS_SAMPLE_RATE": "7"}).sample_rate == 1.0


def test_otel_defaults_point_at_the_endpoint():
    d = otel_defaults(Settings.from_env({"WIZELENS_TOKEN": "t"}))
    assert d["OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://localhost:5960"
    assert d["OTEL_EXPORTER_OTLP_HEADERS"] == "Authorization=Bearer t"
    assert d["OTEL_TRACES_SAMPLER"] == "parentbased_always_on"
    assert ".*password.*" in d["OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SANITIZE_FIELDS"]
    fields = d["OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SANITIZE_FIELDS"].split(",")
    cookie = next(f for f in fields if "cookie" in f)
    assert re.search(cookie, "cookie") and not re.search(cookie, "set-cookie")


def test_your_own_values_win_and_the_project_is_added():
    env = {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector:4318", "OTEL_RESOURCE_ATTRIBUTES": "team=a"}
    apply_otel_defaults(Settings.from_env({"WIZELENS_PROJECT": "shop"}), env)
    assert env["OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://collector:4318"
    assert env["OTEL_RESOURCE_ATTRIBUTES"] == "team=a,wizelens.project=shop"
    apply_otel_defaults(Settings.from_env({"WIZELENS_PROJECT": "shop"}), env)
    assert env["OTEL_RESOURCE_ATTRIBUTES"] == "team=a,wizelens.project=shop"


def test_old_send_names_are_not_read():
    s = Settings.from_env({"WIZELENS_HUB": "https://old.example", "WIZELENS_HUB_TOKEN": "old"})
    assert s.endpoint == "http://localhost:5960" and s.token is None


def test_on_off_values_and_a_bad_value_warns_once(caplog):
    for on in ("true", "1", "ON", "Yes"):
        assert env_flag("WIZELENS_TEST_ON", on, False)
    for off in ("false", "0", "Off", "NO"):
        assert not env_flag("WIZELENS_TEST_OFF", off, True)
    with caplog.at_level(logging.WARNING, logger="wizelens"):
        assert env_flag("WIZELENS_TEST_BAD", "maybe", True) and env_flag("WIZELENS_TEST_BAD", "nah", True)
    assert len([r for r in caplog.records if "WIZELENS_TEST_BAD" in r.getMessage()]) == 1
    assert Settings.from_env({"WIZELENS_CAPTURE_SQL_PARAMETERS": "sometimes"}).capture_sql_parameters
