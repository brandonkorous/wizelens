import * as http from "node:http";
import * as https from "node:https";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWizeLens } from "./index.js";
import { call, clientSpans, type Downstream, spansOf, startDownstream } from "./test/downstream.js";
import { type Running, startApp } from "./test/helpers.js";

const wl = createWizeLens({ service: "libs-out", storage: "memory", captureConsole: false, captureMetrics: false });
const off = createWizeLens({ service: "no-http", storage: "memory", captureConsole: false, captureMetrics: false, instrumentHttp: false });
let app: Running;
let offApp: Running;
let down: Downstream;
const keepAlive = new http.Agent({ keepAlive: true });

/** What axios's http adapter does: transport.request(options, callback), errors on the request, then end(body). */
function axiosLike(url: string, data: unknown): Promise<unknown> {
  const parsed = new URL(url);
  const body = JSON.stringify(data);
  const headers = { Accept: "application/json, text/plain, */*", "Content-Type": "application/json", "User-Agent": "axios/1.7.9", "Content-Length": Buffer.byteLength(body) };
  const options = { protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: "POST", headers, agent: keepAlive };
  return new Promise((resolve, reject) => {
    const req = (parsed.protocol === "https:" ? https : http).request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
    });
    req.on("error", reject);
    req.end(body);
  });
}

const scenarios: Record<string, () => Promise<unknown>> = {
  axios: async () => [await axiosLike(`${down.base}/orders?id=7`, { sku: "a" }), await axiosLike(`${down.base}/orders?id=8`, { sku: "b" })],
  https: () => new Promise((resolve) => https.get("https://127.0.0.1:1/secure", resolve).on("error", resolve)),
  pair: async () => [await (await fetch(`${down.base}/same?x=1`)).text(), await call(`${down.base}/same?x=1`)],
  plain: () => call(`${down.base}/off`),
  direct: () => new Promise((resolve) => new http.ClientRequest({ host: "127.0.0.1", port: down.port, path: "/direct", agent: keepAlive }, (res) => res.resume().on("end", resolve)).end()),
};

beforeAll(async () => {
  down = await startDownstream();
  const routes = (a: Parameters<Parameters<typeof startApp>[1]>[0]) =>
    a.get("/run/:name", async (req, res) => res.json({ out: await scenarios[req.params.name]!() }));
  app = await startApp(wl, routes);
  offApp = await startApp(off, routes);
});

afterAll(async () => {
  keepAlive.destroy();
  await Promise.all([wl.shutdown(), off.shutdown()]);
  await Promise.all([app.close(), offApp.close(), down.close()]);
});

describe("libraries built on node:http", () => {
  it("traces an axios-style call (options object, callback, keep-alive agent, body) with a traceparent", async () => {
    const { traceId, spans } = await spansOf(wl, `${app.base}/run/axios`);
    const out = clientSpans(spans);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.attributes["url.full"])).toEqual([`${down.base}/orders?id=7`, `${down.base}/orders?id=8`]);
    for (const span of out) {
      expect(span.name).toBe(`POST 127.0.0.1:${down.port}/orders`);
      expect(span.attributes).toMatchObject({ "http.request.method": "POST", "user_agent.original": "axios/1.7.9", "http.response.status_code": 200, "server.port": down.port });
    }
    expect(down.seen.get("/orders")?.traceparent).toBe(`00-${traceId}-${out[1]!.spanId}-01`);
  });

  it("traces a ClientRequest made directly, through any Agent", async () => {
    const [span] = clientSpans((await spansOf(wl, `${app.base}/run/direct`)).spans);
    expect(span).toMatchObject({ name: `GET 127.0.0.1:${down.port}/direct`, attributes: expect.objectContaining({ "http.response.status_code": 200 }) });
    expect(down.seen.get("/direct")?.traceparent).toContain(span!.spanId);
  });

  it("traces node:https calls the same way", async () => {
    const [span] = clientSpans((await spansOf(wl, `${app.base}/run/https`)).spans);
    expect(span).toMatchObject({ status: "error", attributes: expect.objectContaining({ "url.scheme": "https", "url.full": "https://127.0.0.1:1/secure", "server.port": 1 }) });
  });

  it("gives node:http spans the attributes fetch spans have", async () => {
    const [fetched, plain] = clientSpans((await spansOf(wl, `${app.base}/run/pair`)).spans).sort((a, b) => a.startMs - b.startMs);
    const keys = (a: object) => Object.keys(a).filter((k) => k !== "user_agent.original").sort();
    expect(keys(plain!.attributes)).toEqual(keys(fetched!.attributes));
    for (const key of ["http.request.method", "url.full", "url.path", "url.query", "url.scheme", "server.address", "server.port", "http.response.status_code"]) {
      expect(plain!.attributes[key]).toEqual(fetched!.attributes[key]);
    }
    expect(plain!.name).toBe(fetched!.name);
  });

  it("leaves node:http alone when instrumentHttp is false", async () => {
    const { spans } = await spansOf(off, `${offApp.base}/run/plain`);
    expect(spans.some((s) => s.category === "http.server")).toBe(true);
    expect(clientSpans(spans)).toEqual([]);
  });
});
