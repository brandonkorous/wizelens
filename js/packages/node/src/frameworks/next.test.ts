import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { SpanKind, trace } from "@opentelemetry/api";
import { afterAll, expect, it } from "vitest";
import type { Trace } from "@wizeworks/lens-core";
import { onRequestError, registerWizeLens } from "./next.js";

const wl = registerWizeLens({ serviceName: "web", storage: "memory", instrumentFetch: false });
let appCalls = 0;

/** What Next.js does per request: a handleRequest span inside the platform span, which gets the route. */
function nextLikeHandler(req: IncomingMessage, res: ServerResponse): void {
  appCalls++;
  const tracer = trace.getTracer("next.js");
  const platform = trace.getActiveSpan();
  const attributes = { "next.span_type": "BaseServer.handleRequest", "http.method": req.method ?? "GET" };
  void tracer.startActiveSpan("GET", { kind: SpanKind.SERVER, attributes }, async (span) => {
    platform?.setAttribute("http.route", "/items/[id]");
    tracer.startActiveSpan("render route (app) /items/[id]", (render) => render.end());
    if (req.url === "/boom") onRequestError(new Error("render failed"), { path: "/boom", method: "GET" }, { routerKind: "App Router", routePath: "/boom", routeType: "render" });
    res.statusCode = req.url === "/boom" ? 500 : 200;
    res.end("<html></html>");
    span.end();
  });
}

const server = createServer(nextLikeHandler);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function traceOf(res: Response): Promise<Trace> {
  await new Promise((r) => setTimeout(r, 30));
  return wl.store.get(res.headers.get("x-wizelens-trace")!)!;
}

it("wraps each Next.js request in a request span named by the route", async () => {
  const res = await fetch(`${base}/items/7`);
  const t = await traceOf(res);
  const server = t.spans.find((s) => s.category === "http.server")!;
  const next = t.spans.find((s) => s.attributes["next.span_type"] === "BaseServer.handleRequest")!;
  const render = t.spans.find((s) => s.name.startsWith("render route"))!;
  expect(server).toMatchObject({ name: "GET /items/[id]", service: "web" });
  expect(server.attributes).toMatchObject({ "http.route": "/items/[id]", "url.path": "/items/7", "http.response.status_code": 200 });
  expect(next.parentSpanId).toBe(server.spanId);
  expect(render.parentSpanId).toBe(next.spanId);
});

it("sends the trace id and endpoint in Server-Timing for the page load", async () => {
  const res = await fetch(`${base}/items/7`);
  const timing = res.headers.get("server-timing")!;
  expect(timing).toContain(`wl-trace;desc=${res.headers.get("x-wizelens-trace")}`);
  expect(timing).toContain(`wl-endpoint;desc="${base}/_wizelens"`);
});

it("skips build files and serves the dashboard without calling the app", async () => {
  const before = appCalls;
  const asset = await fetch(`${base}/_next/static/chunks/app.js`);
  expect(asset.headers.get("x-wizelens-trace")).toBeNull();
  expect(appCalls).toBe(before + 1);
  const info = await fetch(`${base}/_wizelens/api/info`);
  expect(info.status).toBe(200);
  expect(((await info.json()) as { service: string }).service).toBe("web");
  expect(appCalls).toBe(before + 1);
});

it("records an onRequestError error once, with a log", async () => {
  const t = await traceOf(await fetch(`${base}/boom`));
  const server = t.spans.find((s) => s.category === "http.server")!;
  const errors = t.spans.flatMap((s) => s.events.filter((e) => e.name === "exception"));
  expect(server.status).toBe("error");
  expect(errors).toHaveLength(1);
  expect(t.logs.some((l) => l.message === "render failed")).toBe(true);
  onRequestError(new Error("render failed"), { path: "/", method: "GET" }, { routerKind: "App Router", routePath: "/", routeType: "render" });
});

it("starts one instance per process", () => {
  expect(registerWizeLens({ serviceName: "other" })).toBe(wl);
});
