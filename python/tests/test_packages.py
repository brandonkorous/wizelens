import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from wizelens import Settings
from wizelens.packages import list_packages, report_packages, sender_of


def test_lists_installed_distributions_once():
    found = list_packages()
    names = {p["name"].lower() for p in found}
    assert "opentelemetry-api" in names
    assert all(p["ecosystem"] == "PyPI" and p["version"] for p in found)
    assert len({(p["name"].lower(), p["version"]) for p in found}) == len(found)


def test_sender_comes_from_the_resource():
    s = Settings.from_env({"WIZELENS_PROJECT": "shop"})
    out = sender_of(s, {"service.name": "orders", "service.version": "1.2.0", "deployment.environment.name": "prod"})
    assert out == {"service": "orders", "runtime": "otlp python", "project": "shop", "release": "1.2.0", "environment": "prod"}


def test_posts_the_report_with_the_token():
    got = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            got["path"] = self.path
            got["auth"] = self.headers.get("Authorization")
            got["body"] = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            self.send_response(204)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.handle_request, daemon=True).start()
    s = Settings.from_env({"WIZELENS_HUB": f"http://127.0.0.1:{server.server_port}", "WIZELENS_HUB_TOKEN": "t0k"})
    report_packages(s, {"service.name": "orders"}).join(10)
    server.server_close()
    assert got["path"] == "/_wizelens/api/packages" and got["auth"] == "Bearer t0k"
    assert got["body"]["sender"]["service"] == "orders" and len(got["body"]["packages"]) > 3
