import json

from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from wizelens import Settings, WizeLensMiddleware, capture_flask
from wizelens.body import BodyBuffer, is_text, preview


def _server(spans):
    return next(s for s in spans.get_finished_spans() if s.kind.name == "SERVER")


def test_body_helpers():
    assert is_text("application/json; charset=utf-8") and is_text("text/plain") and is_text("application/problem+json")
    assert not is_text("image/png") and not is_text(None)
    buf = BodyBuffer(limit=4)
    buf.add(b"abcdef")
    assert bytes(buf.data) == b"abcd" and buf.truncated
    assert json.loads(preview(b'{"user":"a","password":"x"}', False, Settings.from_env({}))) == {"user": "a", "password": "[redacted]"}


async def _echo(request: Request):
    data = await request.json()
    return JSONResponse({"ok": True, "token": "t", "got": data["item"]})


async def _image(request: Request):
    return PlainTextResponse("x" * 20000)


def _app(settings):
    app = Starlette(routes=[Route("/orders", _echo, methods=["POST"]), Route("/big", _image)])
    app.add_middleware(WizeLensMiddleware, settings=settings)
    return OpenTelemetryMiddleware(app)


def test_asgi_puts_both_bodies_on_the_server_span(spans, body_on):
    client = TestClient(_app(body_on))
    assert client.post("/orders", json={"item": "pen", "password": "p"}).status_code == 200
    attrs = _server(spans).attributes
    assert json.loads(attrs["wizelens.request.body"]) == {"item": "pen", "password": "[redacted]"}
    assert json.loads(attrs["wizelens.response.body"]) == {"ok": True, "token": "[redacted]", "got": "pen"}
    assert "wizelens.request.body.truncated" not in attrs


def test_asgi_cuts_big_bodies(spans, body_on):
    TestClient(_app(body_on)).get("/big")
    attrs = _server(spans).attributes
    assert len(attrs["wizelens.response.body"]) == 16 * 1024 and attrs["wizelens.response.body.truncated"] is True


def test_asgi_does_nothing_when_capture_is_off(spans):
    TestClient(_app(Settings.from_env({}))).post("/orders", json={"item": "pen"})
    assert "wizelens.request.body" not in _server(spans).attributes


def test_flask_puts_both_bodies_on_the_server_span(spans, body_on):
    from flask import Flask, jsonify, request
    from opentelemetry.instrumentation.flask import FlaskInstrumentor

    app = Flask(__name__)

    @app.post("/orders")
    def orders():
        return jsonify({"id": 1, "item": request.get_json()["item"]})

    FlaskInstrumentor().instrument_app(app)
    capture_flask(app, body_on)
    try:
        assert app.test_client().post("/orders", json={"item": "cup"}).status_code == 200
    finally:
        FlaskInstrumentor().uninstrument_app(app)
    attrs = _server(spans).attributes
    assert json.loads(attrs["wizelens.request.body"]) == {"item": "cup"}
    assert json.loads(attrs["wizelens.response.body"]) == {"id": 1, "item": "cup"}
