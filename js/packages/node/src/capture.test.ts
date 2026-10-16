import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Span, Trace } from "@wizeworks/lens-core";
import { createWizeLens, type WizeLens } from "./index.js";
import { getJson, type Running, settle, startApp } from "./test/helpers.js";

const bodyOn = createWizeLens({ serviceName: "capture-api", enabled: true, storage: "memory", instrumentFetch: false, captureResponseBody: true });
const bodyOff = createWizeLens({ serviceName: "plain-api", enabled: true, storage: "memory", instrumentFetch: false });
let on: Running;
let off: Running;

function routes(wizelens: WizeLens) {
  return (a: Parameters<Parameters<typeof startApp>[1]>[0]) => {
    a.get("/items/:id", (req, res) => {
      wizelens.tag("cache", "hit");
      wizelens.tag("catalog");
      wizelens.setUser("user-42");
      res.setHeader("X-Custom", "yes");
      res.json({ id: req.params.id, name: "Keyboard" });
    });
    a.get("/big", (_req, res) => res.type("text/plain").send("x".repeat(20_000)));
    a.get("/bin", (_req, res) => res.type("application/octet-stream").send(Buffer.alloc(10)));
  };
}

beforeAll(async () => {
  on = await startApp(bodyOn, routes(bodyOn));
  off = await startApp(bodyOff, routes(bodyOff));
});

afterAll(async () => {
  await Promise.all([bodyOn.shutdown(), bodyOff.shutdown()]);
  await Promise.all([on.close(), off.close()]);
});

async function serverSpan(app: Running, path: string, init?: RequestInit): Promise<Span> {
  const res = await fetch(`${app.base}${path}`, init);
  await res.arrayBuffer();
  await settle();
  const t = await getJson<Trace>(`${app.base}/_wizelens/api/traces/${res.headers.get("x-wizelens-trace")}`);
  return t.spans.find((s) => s.category === "http.server")!;
}

async function requestFacts(): Promise<void> {
  const headers = { "X-Forwarded-For": "203.0.113.42, 10.0.0.1", "X-Request-Id": "req-1", Authorization: "Bearer secret", "User-Agent": "test-agent" };
  const a = (await serverSpan(off, "/items/7", { headers })).attributes;
  expect(a["client.address"]).toBe("203.0.113.42");
  expect(a["wizelens.request.id"]).toBe("req-1");
  expect(a["user_agent.original"]).toBe("test-agent");
  expect(a["http.request.header.x-request-id"]).toBe("req-1");
  expect(a["http.request.header.authorization"]).toBe("[redacted]");
  expect(a["http.response.header.x-custom"]).toBe("yes");
  expect(a["http.response.header.content-type"]).toContain("application/json");
  expect(a["http.response.body.size"]).toBe(JSON.stringify({ id: "7", name: "Keyboard" }).length);
  expect(a["wizelens.response.body"]).toBeUndefined();
}

async function tagsAndUser(): Promise<void> {
  const a = (await serverSpan(off, "/items/1")).attributes;
  expect(a["wizelens.tag.cache"]).toBe("hit");
  expect(a["wizelens.tag.catalog"]).toBe(true);
  expect(a["enduser.id"]).toBe("user-42");
  expect(typeof a["wizelens.request.id"]).toBe("string");
}

async function keepsBodies(): Promise<void> {
  const json = (await serverSpan(on, "/items/9")).attributes;
  expect(json["wizelens.response.body"]).toBe('{"id":"9","name":"Keyboard"}');
  expect(json["wizelens.response.body.truncated"]).toBe(false);
  const big = (await serverSpan(on, "/big")).attributes;
  expect(String(big["wizelens.response.body"]).length).toBe(16 * 1024);
  expect(big["wizelens.response.body.truncated"]).toBe(true);
  expect(big["http.response.body.size"]).toBe(20_000);
  const bin = (await serverSpan(on, "/bin")).attributes;
  expect(bin["wizelens.response.body"]).toBeUndefined();
  expect(bin["http.response.body.size"]).toBe(10);
}

describe("request capture", () => {
  it("records client, headers, request id, and sizes", requestFacts);
  it("records tags and the user", tagsAndUser);
  it("keeps text and JSON bodies only when asked", keepsBodies);
  it("does nothing outside a request", () => {
    bodyOff.tag("x");
    bodyOff.setUser("y");
  });
});
