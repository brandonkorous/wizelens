from wizelens import Settings
from wizelens.env import apply_otel_defaults, otel_defaults


def test_defaults():
    s = Settings.from_env({})
    assert s.enabled and s.hub == "http://localhost:5960" and s.sample_rate == 1.0
    assert s.keep_errors and s.keep_slow_ms == 1000.0
    assert not s.capture_body and s.capture_sql_parameters and s.capture_logs


def test_reads_the_wizelens_variables():
    s = Settings.from_env({
        "WIZELENS_HUB": "https://app.wizelens.com/",
        "WIZELENS_HUB_TOKEN": "wl_ik_1",
        "WIZELENS_PROJECT": "shop",
        "WIZELENS_SAMPLE_RATE": "0.25",
        "WIZELENS_KEEP_SLOW_MS": "off",
        "WIZELENS_CAPTURE_BODY": "true",
        "WIZELENS_REDACT_KEYS": "ssn, card",
    })
    assert s.hub == "https://app.wizelens.com" and s.token == "wl_ik_1" and s.project == "shop"
    assert s.sample_rate == 0.25 and s.keep_slow_ms is None and s.capture_body
    assert s.is_sensitive("customer_SSN") and s.is_sensitive("Password") and not s.is_sensitive("name")


def test_bad_rate_keeps_everything():
    assert Settings.from_env({"WIZELENS_SAMPLE_RATE": "lots"}).sample_rate == 1.0
    assert Settings.from_env({"WIZELENS_SAMPLE_RATE": "7"}).sample_rate == 1.0


def test_otel_defaults_point_at_the_hub():
    d = otel_defaults(Settings.from_env({"WIZELENS_HUB_TOKEN": "t"}))
    assert d["OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://localhost:5960"
    assert d["OTEL_EXPORTER_OTLP_HEADERS"] == "Authorization=Bearer t"
    assert d["OTEL_TRACES_SAMPLER"] == "parentbased_always_on"
    assert ".*password.*" in d["OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SANITIZE_FIELDS"]


def test_your_own_values_win_and_the_project_is_added():
    env = {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector:4318", "OTEL_RESOURCE_ATTRIBUTES": "team=a"}
    apply_otel_defaults(Settings.from_env({"WIZELENS_PROJECT": "shop"}), env)
    assert env["OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://collector:4318"
    assert env["OTEL_RESOURCE_ATTRIBUTES"] == "team=a,wizelens.project=shop"
    apply_otel_defaults(Settings.from_env({"WIZELENS_PROJECT": "shop"}), env)
    assert env["OTEL_RESOURCE_ATTRIBUTES"] == "team=a,wizelens.project=shop"
