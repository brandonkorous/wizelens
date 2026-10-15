import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newSpanId, newTraceId, formatTraceparent, type Trace, type TraceSummary, type Span } from "@wizeworks/lens-core";
import { createWizeLens, TraceStore } from "./index.js";

function fakeSpan(traceId: string, startMs: number): Span {
  return {
    traceId,
    spanId: newSpanId(),
    parentSpanId: null,
    name: "x",
    kind: "server",
    category: "http.server",
    service: "s",
    startMs,
    durationMs: 1,
    status: "unset",
    statusMessage: null,
    attributes: {},
    events: [],
  };
}

describe("TraceStore", () => {
  it("drops the oldest traces past the limit", () => {
    const store = new TraceStore({ maxTraces: 2 });
    const ids = [newTraceId(), newTraceId(), newTraceId()];
    ids.forEach((id, i) => store.addSpan(fakeSpan(id, Date.now() + i)));
    expect(store.size).toBe(2);
    expect(store.get(ids[0]!)).toBeUndefined();
    expect(store.list().map((t) => t.traceId)).toEqual([ids[2], ids[1]]);
  });

  it("drops traces past the max age", () => {
    let clock = 1_000_000;
    const store = new TraceStore({ maxAgeMs: 1000, now: () => clock });
    const old = newTraceId();
    const fresh = newTraceId();
    store.addSpan(fakeSpan(old, clock - 5000));
    store.addSpan(fakeSpan(fresh, clock - 10));
    expect(store.list().map((t) => t.traceId)).toEqual([fresh]);
    clock += 2000;
    expect(store.list()).toEqual([]);
  });

  it("filters by browser session", () => {
    const store = new TraceStore();
    const mine = newTraceId();
    const other = newTraceId();
    store.addSpan({ ...fakeSpan(mine, Date.now()), attributes: { "wizelens.browser.session": "tab-1" } });
    store.addSpan({ ...fakeSpan(other, Date.now()), attributes: { "wizelens.browser.session": "tab-2" } });
    store.addSpan(fakeSpan(mine, Date.now() + 1)); // server span in the same trace
    expect(store.list(50, "tab-1").map((t) => t.traceId)).toEqual([mine]);
    expect(store.list(50).length).toBe(2);
  });
});

describe("WizeLens endpoints", () => {
  const audit: string[] = [];
  const wizelens = createWizeLens({
    serviceName: "test-api",
    enabled: true,
    enableMcp: true,
    storage: "memory",
    audit: (l) => audit.push(l),
  });
  let server: Server;
  let remote: Server;
  let base = "";
  let remoteUrl = "";

  beforeAll(async () => {
    // A fake downstream service that says "I have WizeLens data" and serves one span for any trace.
    remote = createServer((req, res) => {
      const m = /\/_wizelens\/api\/traces\/([0-9a-f]{32})/.exec(req.url ?? "");
      if (m) {
        const span = { ...fakeSpan(m[1]!, Date.now()), service: "remote-api", name: "GET /remote" };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ traceId: m[1], spans: [span], logs: [], remotes: [] }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json", "X-WizeLens-Endpoint": `${remoteUrl}/_wizelens` });
      res.end("{}");
    });
    await new Promise<void>((r) => remote.listen(0, "127.0.0.1", r));
    remoteUrl = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;

    const app = express();
    app.use(wizelens.middleware);
    app.get("/hello/:id", async (req, res) => {
      wizelens.logger.info("hello", { id: req.params.id, password: "x" });
      wizelens.traceDb({ system: "sqlite", adapter: "test" }, "SELECT * FROM users WHERE id = ?", [req.params.id], () => [{ id: 1 }]);
      await fetch(`${remoteUrl}/thing`);
      res.json({ ok: true });
    });
    app.get("/boom", () => {
      throw new Error("kaboom");
    });
    app.use(wizelens.errorMiddleware);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await wizelens.shutdown();
    server.close();
    remote.close();
  });

  it("traces a request with db, log, outgoing http, and federation", async () => {
    const traceId = newTraceId();
    const res = await fetch(`${base}/hello/7`, { headers: { traceparent: formatTraceparent(traceId, newSpanId()) } });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-wizelens-trace")).toBe(traceId);
    expect(res.headers.get("x-wizelens-endpoint")).toBe(`${base}/_wizelens`);
    expect(res.headers.get("access-control-expose-headers")).toContain("X-WizeLens-Trace");
    await new Promise((r) => setTimeout(r, 20));

    const list = (await (await fetch(`${base}/_wizelens/api/traces`)).json()) as TraceSummary[];
    expect(list.some((t) => t.traceId === traceId)).toBe(true);

    const local = (await (await fetch(`${base}/_wizelens/api/traces/${traceId}`)).json()) as Trace;
    expect(local.rootName).toBe("GET /hello/:id");
    expect(local.dbCount).toBe(1);
    expect(local.httpClientCount).toBe(1);
    expect(local.remotes).toEqual([`${remoteUrl}/_wizelens`]);
    const db = local.spans.find((s) => s.category === "db")!;
    expect(db.attributes["db.query.text"]).toBe("SELECT * FROM users WHERE id = ?");
    expect(db.attributes["wizelens.db.parameters"]).toBe('["7"]');
    expect(db.attributes["db.response.returned_rows"]).toBe(1);
    expect(local.logs[0]!.attributes.password).toBe("[redacted]");

    const federated = (await (await fetch(`${base}/_wizelens/api/traces/${traceId}?federate=true`)).json()) as Trace;
    expect(federated.services).toEqual(["remote-api", "test-api"]);
  });

  it("lists only the traces of one browser session", async () => {
    const traceId = newTraceId();
    const span = { ...fakeSpan(traceId, Date.now()), category: "browser", service: "browser", attributes: { "wizelens.browser.session": "tab-a" } };
    const post = await fetch(`${base}/_wizelens/api/client-spans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spans: [span] }),
    });
    expect(post.status).toBe(204);
    const mine = (await (await fetch(`${base}/_wizelens/api/traces?session=tab-a`)).json()) as TraceSummary[];
    expect(mine.map((t) => t.traceId)).toEqual([traceId]);
    const none = (await (await fetch(`${base}/_wizelens/api/traces?session=tab-b`)).json()) as TraceSummary[];
    expect(none).toEqual([]);
  });

  it("records exceptions", async () => {
    const res = await fetch(`${base}/boom`);
    expect(res.status).toBe(500);
    const traceId = res.headers.get("x-wizelens-trace")!;
    await new Promise((r) => setTimeout(r, 20));
    const t = (await (await fetch(`${base}/_wizelens/api/traces/${traceId}`)).json()) as Trace;
    expect(t.status).toBe("error");
    expect(t.spans[0]!.events[0]!.attributes["exception.message"]).toBe("kaboom");
  });

  it("accepts browser spans", async () => {
    const traceId = newTraceId();
    const span = { ...fakeSpan(traceId, Date.now()), service: "browser", category: "browser", attributes: { token: "t" } };
    const res = await fetch(`${base}/_wizelens/api/client-spans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spans: [span, { bad: true }] }),
    });
    expect(res.status).toBe(204);
    const t = (await (await fetch(`${base}/_wizelens/api/traces/${traceId}`)).json()) as Trace;
    expect(t.spans).toHaveLength(1);
    expect(t.spans[0]!.attributes.token).toBe("[redacted]");
  });

  it("serves info, 404s, CORS, and the UI", async () => {
    const info = await (await fetch(`${base}/_wizelens/api/info`)).json();
    expect(info).toMatchObject({ service: "test-api", mcp: true });
    const missing = await fetch(`${base}/_wizelens/api/traces/${newTraceId()}`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("access-control-allow-origin")).toBe("*");
    const redirect = await fetch(`${base}/_wizelens`, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    const ui = await fetch(`${base}/_wizelens/`);
    expect(ui.headers.get("content-type")).toContain("text/html");
  });

  it("answers MCP tools/list and tools/call with an audit line", async () => {
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    const list = await fetch(`${base}/_wizelens/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    const body = (await list.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((t) => t.name).sort()).toEqual([
      "find_n_plus_one",
      "find_slow_queries",
      "get_errors",
      "get_trace",
      "list_traces",
    ]);
    const call = await fetch(`${base}/_wizelens/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_errors", arguments: {} } }),
    });
    const callBody = (await call.json()) as { result: { content: { text: string }[] } };
    expect(callBody.result.content[0]!.text).toContain("kaboom");
    expect(audit.some((l) => l.includes("tool=get_errors"))).toBe(true);
  });

  it("does nothing when disabled", async () => {
    const off = createWizeLens({ serviceName: "off", enabled: false });
    expect(off.enabled).toBe(false);
    expect(off.traceDb({ system: "x" }, "SELECT 1", [], () => 5)).toBe(5);
  });
});
