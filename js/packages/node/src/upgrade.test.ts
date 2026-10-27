import { createServer, request, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Trace } from "@wizeworks/lens-core";
import { createWizeLens } from "./index.js";
import { getJson } from "./test/helpers.js";

const wizelens = createWizeLens({ serviceName: "live-api", enabled: true, storage: "memory", instrumentFetch: false });
const server = createServer();
let base = "";

// Like @fastify/websocket: the upgrade runs through the app with a stand-in response, and the 101 goes straight to the socket.
beforeAll(async () => {
  const app = express();
  app.use(wizelens.middleware);
  app.get("/live", (req) => {
    req.socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    setTimeout(() => req.socket.destroy(), 300);
  });
  server.on("request", app);
  server.on("upgrade", (req, socket) => {
    const res = new ServerResponse(req);
    res.assignSocket(socket as never);
    app(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function openLive(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = request(`${base}/live`, { headers: { Connection: "Upgrade", Upgrade: "websocket" } });
    req.on("upgrade", (_res, socket) => socket.on("close", () => resolve()));
    req.on("error", reject);
    req.end();
  });
}

describe("WebSocket upgrades", () => {
  it("records a session that closed as a 101 stream, not as aborted, timed to its first byte", async () => {
    await openLive();
    await new Promise((r) => setTimeout(r, 300));
    const list = await getJson<{ traceId: string; rootUrl: string }[]>(`${base}/_wizelens/api/traces?limit=5`);
    const t = await getJson<Trace>(`${base}/_wizelens/api/traces/${list.find((x) => x.rootUrl === "/live")!.traceId}`);
    const span = t.spans.find((s) => s.category === "http.server")!;
    expect(span.attributes["http.response.status_code"]).toBe(101);
    expect(span.attributes["wizelens.stream"]).toBe(true);
    expect(span.attributes["wizelens.request.aborted"]).toBeUndefined();
    expect(span.durationMs).toBeGreaterThanOrEqual(250);
    expect(span.attributes["wizelens.stream.first_byte_ms"]).toBeLessThan(100);
  });
});
