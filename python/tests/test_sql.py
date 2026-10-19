import json
import sqlite3

from opentelemetry.instrumentation.dbapi import trace_integration, unwrap_connect
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

from wizelens import Settings, capture_dbapi_parameters, capture_sqlalchemy_parameters, record_parameters
from wizelens.sql import PARAMS_ATTR, params_json

SETTINGS = Settings.from_env({})


def test_params_json_redacts_sensitive_names():
    assert params_json((7, "pen", None), SETTINGS) == '[7, "pen", null]'
    assert json.loads(params_json({"id": 1, "password": "x"}, SETTINGS)) == {"id": 1, "password": "[redacted]"}
    assert params_json(b"\x00\x01", SETTINGS) == '["<2 bytes>"]'
    assert params_json(None, SETTINGS) is None


def test_dbapi_driver_spans_get_parameters(spans):
    assert capture_dbapi_parameters(SETTINGS)
    trace_integration(sqlite3, "connect", "sqlite")
    try:
        db = sqlite3.connect(":memory:")
        cur = db.cursor()
        cur.execute("create table orders (id integer, item text)")
        cur.execute("select * from orders where id = ? and item = ?", (7, "pen"))
        assert db.execute("select count(*) from orders where id = ?", (8,)).fetchone() == (0,)
    finally:
        unwrap_connect(sqlite3, "connect")
    found = [s for s in spans.get_finished_spans() if s.attributes.get(PARAMS_ATTR)]
    assert len(found) == 2
    assert found[0].attributes[PARAMS_ATTR] == '[7, "pen"]'
    assert found[1].attributes[PARAMS_ATTR] == "[8]"
    assert found[0].attributes["db.statement"] == "select * from orders where id = ? and item = ?"


def test_sqlalchemy_spans_get_parameters(spans):
    from sqlalchemy import create_engine, text

    assert capture_sqlalchemy_parameters(SETTINGS)
    engine = create_engine("sqlite://")
    SQLAlchemyInstrumentor().instrument(engine=engine)
    try:
        with engine.connect() as conn:
            conn.execute(text("create table t (id integer, token text)"))
            conn.execute(text("select * from t where id = :id and token = :token"), {"id": 3, "token": "s3cret"})
    finally:
        SQLAlchemyInstrumentor().uninstrument()
    found = [s for s in spans.get_finished_spans() if s.attributes.get(PARAMS_ATTR)]
    assert [json.loads(s.attributes[PARAMS_ATTR]) for s in found] == [{"id": 3, "token": "[redacted]"}]


def test_record_parameters_on_the_current_span(spans, provider):
    with provider.get_tracer("t").start_as_current_span("custom query"):
        record_parameters({"sku": "A1"}, settings=SETTINGS)
    assert spans.get_finished_spans()[0].attributes[PARAMS_ATTR] == '{"sku": "A1"}'
