#!/usr/bin/env node
// End-to-end check of a fresh WizeLens Cloud: node scripts/cloud-smoke.mjs http://localhost:5970
import { randomBytes, randomUUID } from "node:crypto";

const base = (process.argv[2] ?? "http://localhost:5970").replace(/\/+$/, "");
let cookie = "";

function check(ok, what) {
  if (!ok) throw new Error(`cloud-smoke: ${what}`);
  console.log(`ok  ${what}`);
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${base}/_wizelens/${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-WizeLens-Client": "dashboard", Cookie: cookie, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

const hex = (n) => randomBytes(n).toString("hex");

function spans(now) {
  const traceId = hex(16);
  const server = { traceId, spanId: hex(8), parentSpanId: null, name: "GET /orders", kind: "server", category: "http.server", service: "smoke-api", startMs: now - 5000, durationMs: 40, status: "error", statusMessage: "boom", attributes: { "http.request.method": "GET", "url.path": "/orders", "http.response.status_code": 500 }, events: [{ name: "exception", timeMs: now - 4990, attributes: { "exception.type": "SmokeError", "exception.message": "boom" } }] };
  const db = { ...server, spanId: hex(8), parentSpanId: server.spanId, name: "SELECT orders", kind: "client", category: "db", durationMs: 12, status: "unset", statusMessage: null, attributes: { "db.system.name": "postgresql", "db.query.text": "SELECT * FROM orders" }, events: [] };
  return { traceId, list: [server, db] };
}

async function setup() {
  const state = await call("GET", "api/auth/state");
  check(state.body.needsSetup === true, "a fresh cloud asks for setup");
  const made = await call("POST", "api/auth/setup", { email: `owner-${randomUUID()}@smoke.test`, password: `pw-${randomUUID()}`, name: "Smoke", orgName: "Smoke Org" });
  check(made.status === 201 && cookie.startsWith("wizelens_session="), "setup signs the owner in");
  const me = (await call("GET", "api/auth/state")).body;
  return { orgId: me.orgs[0].id, projectId: me.orgs[0].projects[0].id };
}

async function ingest(orgId, projectId) {
  const key = (await call("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", name: "smoke", projectIds: [projectId] })).body.token;
  check(key?.startsWith("wl_ik_"), "an ingest key is made");
  const { traceId, list } = spans(Date.now());
  const res = await fetch(`${base}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "smoke-api", environment: "ci" }, spans: list }) });
  check(res.status === 204, "an add-on batch is accepted");
  return traceId;
}

async function read(orgId, projectId, traceId) {
  const trace = await call("GET", `api/traces/${traceId}?project=${projectId}`);
  check(trace.status === 200 && trace.body.spans.length === 2, "the trace reads back from the database");
  const week = await call("GET", `api/models/overview?project=${projectId}&range=7d`);
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
