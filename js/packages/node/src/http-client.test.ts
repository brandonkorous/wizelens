import { context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { HEADER_HOP } from "@wizeworks/lens-core/internal";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createWizeLens } from "./index.js";
import { call, clientSpans, type Downstream, spansOf, startDownstream } from "./test/downstream.js";
import { type Running, startApp } from "./test/helpers.js";

const wl = createWizeLens({ service: "http-out", storage: "memory", captureConsole: false, captureMetrics: false });
let app: Running;
let down: Downstream;

function slowAborted(): Promise<number | string> {
  const abort = new AbortController();
  setTimeout(() => abort.abort(), 50);
  return call(`${down.base}/slow`, { signal: abort.signal });
}

const scenarios: Record<string, () => Promise<unknown>> = {
  ok: () => call(`${down.base}/ok?q=1&page=2`),
  fail: () => call(`${down.base}/fail`),
  refused: () => call("http://127.0.0.1:1/nowhere"),
  aborted: slowAborted,
  cut: () => call(`${down.base}/cut`),
  remote: () => call(`${down.base}/remote`),
  fetch: async () => (await fetch(`${down.base}/fetched`)).text(),
  quiet: () => context.with(suppressTracing(context.active()), () => call(`${down.base}/quiet`)),
  hop: () => call(`${down.base}/hop`, { headers: { [HEADER_HOP]: "1" } }),
};

beforeAll(async () => {
  down = await startDownstream();
  app = await startApp(wl, (a) => a.get("/run/:name", async (req, res) => res.json({ out: await scenarios[req.params.name]!() })));
});

afterAll(async () => {
  await wl.shutdown();
  await Promise.all([app.close(), down.close()]);
});

const run = (name: string) => spansOf(wl, `${app.base}/run/${name}`);

it("turns an outgoing node:http call into an http.client span with the fetch attributes, under the request, with a traceparent", async () => {
  const { traceId, spans } = await run("ok");
  const [span] = clientSpans(spans);
  const server = spans.find((s) => s.category === "http.server")!;
  expect(span).toMatchObject({ kind: "client", status: "unset", parentSpanId: server.spanId, name: `GET 127.0.0.1:${down.port}/ok` });
  expect(span!.attributes).toMatchObject({
    "http.request.method": "GET",
    "http.request.method_original": "GET",
    "url.full": `${down.base}/ok?q=1&page=2`,
    "url.path": "/ok",
    "url.query": "?q=1&page=2",
    "url.scheme": "http",
    "server.address": "127.0.0.1",
    "server.port": down.port,
    "http.response.status_code": 200,
    "network.peer.port": down.port,
  });
  expect(span!.durationMs).toBeGreaterThan(0);
  expect(down.seen.get("/ok")?.traceparent).toBe(`00-${traceId}-${span!.spanId}-01`);
});

it("marks a 500 as an error", async () => {
  const [span] = clientSpans((await run("fail")).spans);
  expect(span).toMatchObject({ status: "error", attributes: expect.objectContaining({ "http.response.status_code": 500, "error.type": "500" }) });
});

it("records a failed connection as an exception", async () => {
  const [span] = clientSpans((await run("refused")).spans);
  expect(span).toMatchObject({ status: "error", attributes: expect.objectContaining({ "error.type": "ECONNREFUSED", "server.port": 1 }) });
  expect(span!.events.map((e) => e.name)).toContain("exception");
});

it("keeps a call the caller aborted, without an error, as fetch does", async () => {
  const [span] = clientSpans((await run("aborted")).spans);
  expect(span).toMatchObject({ status: "unset", attributes: expect.objectContaining({ "url.path": "/slow" }) });
  expect(span!.attributes["http.response.status_code"]).toBeUndefined();
});

it("marks a body the server cut off as an error", async () => {
  const [span] = clientSpans((await run("cut")).spans);
  expect(span).toMatchObject({ status: "error", attributes: expect.objectContaining({ "http.response.status_code": 200, "error.type": "ECONNRESET" }) });
});

it("keeps the WizeLens endpoint a called service reports, for federation", async () => {
  const { traceId } = await run("remote");
  expect(wl.store.get(traceId)?.remotes).toContain("http://other.test/_wizelens");
});

it("traces a fetch call once, not again as node:http", async () => {
  const { traceId, spans } = await run("fetch");
  const out = clientSpans(spans);
  expect(out).toHaveLength(1);
  expect(out[0]!.attributes["url.path"]).toBe("/fetched");
  expect(down.seen.get("/fetched")?.traceparent).toBe(`00-${traceId}-${out[0]!.spanId}-01`);
});

it("skips calls with tracing off (WizeLens's own) and federation hops", async () => {
  for (const name of ["quiet", "hop"]) {
    expect(clientSpans((await run(name)).spans)).toEqual([]);
    expect(down.seen.get(`/${name}`)?.traceparent).toBeUndefined();
  }
});

it("skips calls outside a request", async () => {
  expect(await call(`${down.base}/outside`)).toBe(200);
  expect(down.seen.get("/outside")?.traceparent).toBeUndefined();
  const all = wl.store.all().flatMap((t) => clientSpans(t.spans));
  expect(all.some((s) => s.attributes["url.path"] === "/outside")).toBe(false);
});
