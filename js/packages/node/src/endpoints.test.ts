import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatTraceparent, newSpanId, newTraceId, type Trace, type TraceSummary } from "@wizeworks/lens-core";
import { createWizeLens } from "./index.js";
import { fakeSpan, getJson, type Running, settle, startApp, startRemote } from "./test/helpers.js";

const wizelens = createWizeLens({ serviceName: "test-api", enabled: true, enableMcp: true, storage: "memory", audit: () => {} });
let app: Running;
let remote: Running;

beforeAll(async () => {
  remote = await startRemote();
  app = await startApp(wizelens, (a) => {
    a.get("/hello/:id", async (req, res) => {
      wizelens.logger.info("hello", { id: req.params.id, password: "x" });
      wizelens.traceDb({ system: "sqlite", adapter: "test" }, "SELECT * FROM users WHERE id = ?", [req.params.id], () => [{ id: 1 }]);
      await fetch(`${remote.base}/thing`);
      res.json({ ok: true });
    });
    a.get("/boom", () => {
      throw new Error("kaboom");
    });
  });
});

afterAll(async () => {
  await wizelens.shutdown();
  await app.close();
  await remote.close();
});

const postSpans = (spans: unknown[]) =>
  fetch(`${app.base}/_wizelens/api/client-spans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spans }),
  });

async function tracesARequest(): Promise<void> {
  const traceId = newTraceId();
  const res = await fetch(`${app.base}/hello/7`, { headers: { traceparent: formatTraceparent(traceId, newSpanId()) } });
  expect(res.status).toBe(200);
  expect(res.headers.get("x-wizelens-trace")).toBe(traceId);
  expect(res.headers.get("x-wizelens-endpoint")).toBe(`${app.base}/_wizelens`);
  expect(res.headers.get("access-control-expose-headers")).toContain("X-WizeLens-Trace");
  await settle();
  const list = await getJson<TraceSummary[]>(`${app.base}/_wizelens/api/traces`);
  expect(list.some((t) => t.traceId === traceId)).toBe(true);
  const local = await getJson<Trace>(`${app.base}/_wizelens/api/traces/${traceId}`);
  expect(local).toMatchObject({ rootName: "GET /hello/:id", dbCount: 1, httpClientCount: 1, remotes: [`${remote.base}/_wizelens`] });
  const db = local.spans.find((s) => s.category === "db")!;
  expect(db.attributes["db.query.text"]).toBe("SELECT * FROM users WHERE id = ?");
  expect(db.attributes["wizelens.db.parameters"]).toBe('["7"]');
  expect(db.attributes["db.response.returned_rows"]).toBe(1);
  expect(local.logs[0]!.attributes.password).toBe("[redacted]");
  const federated = await getJson<Trace>(`${app.base}/_wizelens/api/traces/${traceId}?federate=true`);
  expect(federated.services).toEqual(["remote-api", "test-api"]);
}

async function listsOneSession(): Promise<void> {
  const traceId = newTraceId();
  const span = { ...fakeSpan(traceId, Date.now(), { "wizelens.browser.session": "tab-a" }), category: "browser", service: "browser" };
  expect((await postSpans([span])).status).toBe(204);
  const mine = await getJson<TraceSummary[]>(`${app.base}/_wizelens/api/traces?session=tab-a`);
  expect(mine.map((t) => t.traceId)).toEqual([traceId]);
  expect(await getJson(`${app.base}/_wizelens/api/traces?session=tab-b`)).toEqual([]);
}

async function recordsExceptions(): Promise<void> {
  const res = await fetch(`${app.base}/boom`);
  expect(res.status).toBe(500);
  await settle();
  const t = await getJson<Trace>(`${app.base}/_wizelens/api/traces/${res.headers.get("x-wizelens-trace")}`);
  expect(t.status).toBe("error");
  expect(t.spans[0]!.events[0]!.attributes["exception.message"]).toBe("kaboom");
}

async function acceptsBrowserSpans(): Promise<void> {
  const traceId = newTraceId();
  const span = { ...fakeSpan(traceId, Date.now(), { token: "t" }), service: "browser", category: "browser" };
  expect((await postSpans([span, { bad: true }])).status).toBe(204);
  const t = await getJson<Trace>(`${app.base}/_wizelens/api/traces/${traceId}`);
  expect(t.spans).toHaveLength(1);
  expect(t.spans[0]!.attributes.token).toBe("[redacted]");
}

async function servesTheRest(): Promise<void> {
  expect(await getJson(`${app.base}/_wizelens/api/info`)).toMatchObject({ service: "test-api", mcp: true });
  const missing = await fetch(`${app.base}/_wizelens/api/traces/${newTraceId()}`);
  expect(missing.status).toBe(404);
  expect(missing.headers.get("access-control-allow-origin")).toBe("*");
  expect((await fetch(`${app.base}/_wizelens`, { redirect: "manual" })).status).toBe(302);
  expect((await fetch(`${app.base}/_wizelens/`)).headers.get("content-type")).toContain("text/html");
}

describe("WizeLens endpoints", () => {
  it("traces a request with db, log, outgoing http, and federation", tracesARequest);
  it("lists only the traces of one browser session", listsOneSession);
  it("records exceptions", recordsExceptions);
  it("accepts browser spans", acceptsBrowserSpans);
  it("serves info, 404s, CORS, and the UI", servesTheRest);
  it("does nothing when disabled", () => {
    const off = createWizeLens({ serviceName: "off", enabled: false });
    expect(off.enabled).toBe(false);
    expect(off.traceDb({ system: "x" }, "SELECT 1", [], () => 5)).toBe(5);
    off.tag("a", "b");
    off.setUser("u");
  });
});
