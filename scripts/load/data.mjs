// Synthetic traffic for the load test: requests with queries, an HTTP call, logs, and attributes, spread back in time.
import { randomBytes } from "node:crypto";

const SERVICES = ["api", "checkout", "billing", "orders", "search", "auth", "inventory", "mailer"];
const NOUNS = ["orders", "users", "carts", "items", "invoices"];
const PATHS = Array.from({ length: 40 }, (_, i) => `/api/${NOUNS[i % 5]}/${i}`);
const WORDS = ["timeout", "connection reset", "deadlock", "retry", "cache miss", "rate limited", "not found", "slow disk"];
const SQL = Array.from({ length: 60 }, (_, i) => `SELECT * FROM t${i % 12} WHERE id = $1 AND tenant = $2 /* q${i} */`);

const hex = (n) => randomBytes(n).toString("hex");
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** The request span: 2% fail, durations skew short with a long tail. */
function rootSpan(traceId, startMs) {
  const path = pick(PATHS);
  const failed = Math.random() < 0.02;
  const attributes = { "http.request.method": "GET", "url.path": path, "http.route": path.replace(/\d+$/, "{id}"), "http.response.status_code": failed ? 500 : 200, "enduser.id": `u-${Math.floor(Math.random() * 10_000)}` };
  const status = failed ? "error" : "unset";
  return { traceId, spanId: hex(8), parentSpanId: null, name: `GET ${path}`, kind: "server", category: "http.server", service: pick(SERVICES), startMs, durationMs: 5 + Math.random() ** 3 * 3000, status, statusMessage: failed ? pick(WORDS) : null, attributes, events: [] };
}

/** One trace of 5 spans and 2 logs, starting at `startMs`. */
export function trace(startMs) {
  const root = rootSpan(hex(16), startMs);
  const child = (i, extra) => ({ ...root, spanId: hex(8), parentSpanId: root.spanId, startMs: startMs + i, status: "unset", statusMessage: null, events: [], ...extra });
  const query = (i) => child(i, { name: "SELECT", kind: "client", category: "db", durationMs: Math.random() ** 4 * 800, attributes: { "db.system.name": "postgresql", "db.query.text": pick(SQL) } });
  const call = child(4, { name: "GET payments", kind: "client", category: "http.client", durationMs: 20 + Math.random() * 200, attributes: { "http.request.method": "GET", "url.full": "https://payments.internal/charge", "http.response.status_code": 200 } });
  const failed = root.status === "error";
  const log = (i, level, message) => ({ traceId: root.traceId, log: { timeMs: startMs + i, level, category: "app", message, spanId: root.spanId, attributes: {} } });
  const logs = [log(2, "info", `handled ${root.attributes["url.path"]} for ${root.attributes["enduser.id"]}`), log(3, failed ? "error" : "debug", failed ? `failed: ${root.statusMessage}` : `cache ${pick(["hit", "miss"])}`)];
  return { spans: [root, query(1), query(2), query(3), call], logs };
}

/** One ingest body of `n` traces, each at a random time in the last `days` days (at least a minute ago). */
export function batch(n, days, now = Date.now()) {
  const spans = [];
  const logs = [];
  for (let i = 0; i < n; i++) {
    const t = trace(now - 60_000 - Math.random() * days * 86_400_000);
    spans.push(...t.spans);
    logs.push(...t.logs);
  }
  return JSON.stringify({ sender: { service: "load", environment: "prod" }, spans, logs });
}
