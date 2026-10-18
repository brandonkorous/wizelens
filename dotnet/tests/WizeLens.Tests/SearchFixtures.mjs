// Writes SearchFixtures.json from the TS core (js/packages/core/dist): node dotnet/tests/WizeLens.Tests/SearchFixtures.mjs
import { writeFileSync } from "node:fs";
const core = await import(new URL("../../../js/packages/core/dist/index.js", import.meta.url));
const sp = (o) => ({ parentSpanId: null, kind: "internal", category: "internal", service: "api", status: "unset", statusMessage: null, events: [], attributes: {}, ...o });
const T1 = "a".repeat(32), T2 = "b".repeat(32), T3 = "c".repeat(32);
const spans1 = [
  sp({ traceId: T1, spanId: "s1", name: "POST /orders/42", kind: "server", category: "http.server", startMs: 1000, durationMs: 800, status: "error", statusMessage: "boom",
    attributes: { "http.request.method": "post", "url.path": "/orders/42", "url.query": "x=1&flag", "http.response.status_code": 503, "user_agent.original": "curl", "client.address": "10.0.0.1", "enduser.id": "alice", "wizelens.request.id": "req-1", "wizelens.tag.beta": true, "wizelens.tag.plan": "pro", tenant: 7 },
    events: [{ name: "exception", timeMs: 1001, attributes: { "exception.message": "kaboom" } }] }),
  ...[0,1,2,3,4].map(i => sp({ traceId: T1, spanId: "d" + i, parentSpanId: "s1", name: "SELECT a", kind: "client", category: "db", startMs: 1010 + i * 20, durationMs: 10, attributes: { "db.query.text": "SELECT * FROM a WHERE id = @id", "wizelens.db.parameters": i < 2 ? "{\"@id\":1}" : `{"@id":${i}}` } })),
  sp({ traceId: T1, spanId: "d5", parentSpanId: "s1", name: "slow", category: "db", startMs: 1200, durationMs: 150, attributes: { "db.query.text": "SELECT pg_sleep(1)" } }),
  sp({ traceId: T1, spanId: "d6", parentSpanId: "s1", name: "slow2", category: "db", startMs: 1210, durationMs: 120, attributes: { "db.query.text": "SELECT 2" } }),
  sp({ traceId: T1, spanId: "d7", parentSpanId: "s1", name: "set", category: "db", startMs: 1500, durationMs: 200, attributes: { "db.query.text": "SET x = 1" } }),
  ...[0,1,2,3,4].map(i => sp({ traceId: T1, spanId: "c" + i, parentSpanId: "s1", name: "GET", kind: "client", category: "http.client", startMs: 1100 + i, durationMs: 5, attributes: { "http.request.method": "get", "url.full": "http://inventory:8080/items/1?q=2" } })),
];
const spans2 = [
  sp({ traceId: T2, spanId: "f1", name: "fetch /api/cart", service: "browser", category: "browser", startMs: 5000, durationMs: 200, attributes: { "url.full": "https://shop.test/api/cart?id=3", "http.request.method": "GET", "http.response.status_code": 200, "wizelens.browser.render_ms": 30 } }),
  sp({ traceId: T2, spanId: "g1", parentSpanId: "f1", name: "Cart/Get", kind: "server", category: "http.server", service: "cart", startMs: 5050, durationMs: 100, attributes: { "rpc.system": "grpc", "rpc.service": "Cart", "rpc.method": "Get" } }),
];
const spans3 = [sp({ traceId: T3, spanId: "p1", name: "pageview /", service: "browser", category: "browser", startMs: 9000, durationMs: 1, attributes: { "wizelens.browser.type": "pageview" } })];
const logs1 = [{ timeMs: 1300, level: "warn", category: "Orders", message: "slow bank", service: "api", spanId: "s1", attributes: { attempt: 2 } }];
const traces = [core.buildTrace(T1, spans1, logs1, []), core.buildTrace(T2, spans2, [], []), core.buildTrace(T3, spans3, [], [])];
const items = traces.map(t => { const r = core.requestOf(t); return r ? core.requestItemOf(r) : null; });
const win = { from: 0, to: 10000 };
const run = (q, kind = "requests") => core.searchMemory(traces, { kind, node: core.parseSearch(q), window: win, limit: 50 }).items.map(i => i.traceId + (i.spanId ? ":" + i.spanId : ""));
const out = {
  items,
  queries: Object.fromEntries(["", "kaboom", "status:5xx", "route:\"/orders/{}?x={}&flag\"", "@tenant:7", "user:alice beta", "\"plan:pro\"", "service:cart", "service:browser", "method:grpc", "path:/api/cart", "error:false", "duration:>200ms", "req-1", "10.0.0"].map(q => [q, run(q)])),
  suggest: {
    none: core.suggestMemory(traces, { field: null, prefix: "", window: win, limit: 50 }),
    at: core.suggestMemory(traces, { field: null, prefix: "@url", window: win, limit: 5 }),
    service: core.suggestMemory(traces, { field: "service", prefix: "", window: win, limit: 50 }),
    tenant: core.suggestMemory(traces, { field: "@db.query.text", prefix: "select", window: win, limit: 3 }),
    status: core.suggestMemory(traces, { field: "status", prefix: "5", window: win, limit: 50 }),
    env: core.suggestMemory(traces, { field: "env", prefix: "", window: win, limit: 50 }),
    envSet: core.suggestMemory(traces, { field: "env", prefix: "p", window: win, limit: 50, env: "prod" }),
  },
  req: Object.fromEntries(["kind=nope", "range=2h", "range=30d", "from=5&to=1", "from=1&to=5", "q=status:abc", "cursor=xyz", "limit=abc", "limit=999&env=prod", "range=constructor"].map(s => {
    const r = core.searchRequestOf(new URLSearchParams(s), 100000000, 7 * 86400000);
    return [s, r.ok ? { ok: true, kind: r.query.kind, window: r.query.window, limit: r.query.limit, env: r.query.env ?? null } : r];
  })),
  sug: Object.fromEntries(["", "limit=0", "limit=99&prefix=" + "x".repeat(300) + "&field=service", "range=bad"].map(s => { const r = core.suggestRequestOf(new URLSearchParams(s), 100000000, 7 * 86400000); return [s, r.ok ? { ...r.request, prefix: r.request.prefix.length } : r]; })),
};
writeFileSync(new URL("./SearchFixtures.json", import.meta.url), JSON.stringify({ about: "TS results for the traces in SearchFixtures.mjs and SearchFixtures.cs. Regenerate with node SearchFixtures.mjs.", ...out }, null, 1) + "\n");
