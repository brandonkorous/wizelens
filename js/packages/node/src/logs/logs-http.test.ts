import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { logs as logsApi } from "@opentelemetry/api-logs";
import { LoggerProvider } from "@opentelemetry/sdk-logs";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { newSpanId, newTraceId } from "@wizeworks/lens-core";
import { wizeLensFastify } from "../frameworks/fastify.js";
import { createWizeLens } from "../wizelens.js";
import { wizeLensLogProcessor } from "./otel.js";

const wl = createWizeLens({ service: "fastify-logs", storage: "memory", instrumentFetch: false });
const app = Fastify({ logger: { level: "info", stream: new Writable({ write: (_c, _e, cb) => cb() }) } });
afterAll(async () => {
  await app.close();
  await wl.shutdown();
});

const base = async () => {
  if (!app.server.listening) {
    await app.register(wizeLensFastify(wl));
    app.get("/orders", async (request) => {
      request.log.info({ count: 2 }, "listing orders");
      app.log.warn("slow cache");
      console.info("from console");
      return [];
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
  }
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
};

describe("Fastify logs", () => {
  it("puts request.log, app.log, and console lines into the request's trace", async () => {
    const res = await fetch(`${await base()}/orders`);
    await new Promise((r) => setTimeout(r, 30));
    const logs = wl.store.get(res.headers.get("x-wizelens-trace")!)!.logs;
    expect(logs.map((l) => [l.level, l.message])).toEqual([
      ["info", "listing orders"],
      ["warn", "slow cache"],
      ["info", "from console"],
    ]);
    expect(logs[0]!.attributes).toMatchObject({ count: 2, reqId: expect.any(String) });
  });

  it("accepts browser logs with the browser spans", async () => {
    const traceId = newTraceId();
    const good = { traceId, spanId: newSpanId(), timeMs: 1, level: "warn", category: "console", message: "x".repeat(5000), attributes: { token: "t" } };
    const body = JSON.stringify({ spans: [], logs: [good, { traceId: "bad" }, { traceId, level: "loud" }] });
    const res = await fetch(`${await base()}/_wizelens/api/client-spans`, { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(res.status).toBe(204);
    const logs = wl.store.get(traceId)!.logs;
    expect(logs.map((l) => [l.level, l.service, l.message.length])).toEqual([["warn", "browser", 4000], ["info", "browser", 0]]);
    expect(logs[0]!.attributes.token).toBe("[redacted]");
  });
});

describe("OpenTelemetry logs", () => {
  it("copies records inside a span and skips bridged pino records", () => {
    const provider = new LoggerProvider({ processors: [wizeLensLogProcessor(wl)] });
    logsApi.setGlobalLoggerProvider(provider);
    let traceId = "";
    wl.tracer.startActiveSpan("job", (span) => {
      traceId = span.spanContext().traceId;
      logsApi.getLogger("billing").emit({ severityNumber: 13, body: "invoice late", attributes: { id: 9 } });
      logsApi.getLogger("@opentelemetry/instrumentation-pino").emit({ severityNumber: 9, body: "dup" });
      span.end();
    });
    logsApi.getLogger("billing").emit({ severityNumber: 9, body: "no span" });
    const logs = wl.store.get(traceId)!.logs;
    expect(logs.map((l) => [l.level, l.category, l.message, l.attributes.id])).toEqual([["warn", "billing", "invoice late", 9]]);
    logsApi.disable();
  });
});
