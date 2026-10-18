#!/usr/bin/env node
// End-to-end check of a fresh WizeLens Cloud without SMTP: node scripts/cloud-smoke.mjs http://localhost:5970 <setup token>
import { randomBytes, randomUUID } from "node:crypto";

const base = (process.argv[2] ?? "http://localhost:5970").replace(/\/+$/, "");
const setupToken = process.argv[3] ?? process.env.WIZELENS_CLOUD_SETUP_TOKEN ?? "";
const cookies = new Map();
const cookie = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");

function check(ok, what) {
  if (!ok) throw new Error(`cloud-smoke: ${what}`);
  console.log(`ok  ${what}`);
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${base}/_wizelens/${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-WizeLens-Client": "dashboard", Origin: base, Cookie: cookie(), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const set of res.headers.getSetCookie()) {
    const [k, v] = set.split(";")[0].split("=");
    cookies.set(k.trim(), v);
  }
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

const hex = (n) => randomBytes(n).toString("hex");

/** Ask again every 500 ms until `done`, for at most 30 s. Returns the last answer. */
async function until(ask, done) {
  let last = await ask();
  for (let i = 0; i < 60 && !done(last); i++) {
    await new Promise((r) => setTimeout(r, 500));
    last = await ask();
  }
  return last;
}

function spans(now) {
  const traceId = hex(16);
  const server = { traceId, spanId: hex(8), parentSpanId: null, name: "GET /orders", kind: "server", category: "http.server", service: "smoke-api", startMs: now - 5000, durationMs: 40, status: "error", statusMessage: "boom", attributes: { "http.request.method": "GET", "url.path": "/orders", "http.response.status_code": 500 }, events: [{ name: "exception", timeMs: now - 4990, attributes: { "exception.type": "SmokeError", "exception.message": "boom" } }] };
  const db = { ...server, spanId: hex(8), parentSpanId: server.spanId, name: "SELECT orders", kind: "client", category: "db", durationMs: 12, status: "unset", statusMessage: null, attributes: { "db.system.name": "postgresql", "db.query.text": "SELECT * FROM orders" }, events: [] };
  return { traceId, list: [server, db] };
}

async function setup() {
  const state = await call("GET", "api/me");
  check(state.body.needsSetup === true, "a fresh cloud asks for setup");
  const account = { email: `owner-${randomUUID()}@smoke.test`, password: `pw-${randomUUID()}`, name: "Smoke" };
  const refused = await call("POST", "api/auth/sign-up/email", account);
  check(refused.status === 403, "the first account needs the setup token");
  const made = await call("POST", "api/auth/sign-up/email", account, { "x-wizelens-setup-token": setupToken });
  check(made.status === 200 && cookie().includes("wizelens.session_token="), "setup signs the owner in");
  const me = (await call("GET", "api/me")).body;
  return { orgId: me.orgs[0].id, projectId: me.orgs[0].projects[0].id };
}

async function ingest(orgId, projectId) {
  const key = (await call("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", name: "smoke", projectIds: [projectId] })).body.token;
  check(key?.startsWith("wl_ik_"), "an ingest key is made");
  const { traceId, list } = spans(Date.now());
  const res = await fetch(`${base}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "smoke-api", environment: "ci" }, spans: list }) });
  check(res.status === 204, "an add-on batch is accepted");
  await metrics(projectId, key);
  return traceId;
}

async function metrics(projectId, key) {
  const nanos = String(BigInt(Date.now() - 30_000) * 1_000_000n);
  const point = { name: "process.cpu.utilization", unit: "1", gauge: { dataPoints: [{ timeUnixNano: nanos, asDouble: 0.42 }] } };
  const body = { resourceMetrics: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "smoke-api" } }] }, scopeMetrics: [{ metrics: [point] }] }] };
  const res = await fetch(`${base}/v1/metrics`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  check(res.status === 200, "an OTLP metric is accepted");
  const page = await call("GET", `api/models/metrics?project=${projectId}&range=1h&metric=process.cpu.utilization`);
  check(page.body.selected?.summary.last === 0.42, "the metric reads back from the metrics page");
}

async function read(orgId, projectId, traceId) {
  const trace = await call("GET", `api/traces/${traceId}?project=${projectId}`);
  check(trace.status === 200 && trace.body.spans.length === 2, "the trace reads back from the database");
  // Stats come from a background job that sums a trace once it has been quiet for 5 s, so wait for it.
  const week = await until(() => call("GET", `api/models/overview?project=${projectId}&range=7d`), (r) => r.body?.headlines?.total?.value === 1);
  check(week.status === 200 && week.body.headlines.total.value === 1, "the server computes a 7-day overview");
  const errors = await call("GET", `api/models/errors?project=${projectId}&range=24h`);
  check(errors.body.groups[0]?.type === "SmokeError", "the server groups the error");
  const share = await call("POST", `api/projects/${projectId}/shares`, { traceId, days: 1 });
  const token = share.body.url.split("/shared/")[1];
  const open = await fetch(`${base}/_wizelens/api/shared/${token}`);
  check(open.status === 200, "a share link opens without sign-in");
}

async function mcp(orgId, projectId) {
  const key = (await call("POST", `api/orgs/${orgId}/keys`, { kind: "read", name: "agent", projectIds: [projectId] })).body.token;
  const res = await fetch(`${base}/_wizelens/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_errors", arguments: {} } }),
  });
  const body = await res.json();
  check(body.result?.content?.[0]?.text.includes("boom"), "an agent reads errors over MCP with a read key");
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    found = (await call("GET", `api/orgs/${orgId}/audit`)).body.some((a) => a.action === "mcp.call");
    if (!found) await new Promise((r) => setTimeout(r, 100));
  }
  check(found, "the MCP call is in the audit log");
}

const { orgId, projectId } = await setup();
const traceId = await ingest(orgId, projectId);
await read(orgId, projectId, traceId);
await mcp(orgId, projectId);
console.log("cloud-smoke: all checks passed");
