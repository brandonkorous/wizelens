import * as grpc from "@grpc/grpc-js";
import { context, trace } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Span } from "@wizeworks/lens-core";
import { createWizeLens } from "../wizelens.js";
import { instrumentGrpc } from "./index.js";

const wl = createWizeLens({ serviceName: "grpc-api", storage: "memory", instrumentFetch: false });
const json = { serialize: (v: unknown) => Buffer.from(JSON.stringify(v)), deserialize: (b: Buffer) => JSON.parse(b.toString()) as unknown };
const method = (name: string, responseStream = false) => ({
  path: `/shop.v1.Items/${name}`,
  requestStream: false,
  responseStream,
  requestSerialize: json.serialize,
  requestDeserialize: json.deserialize,
  responseSerialize: json.serialize,
  responseDeserialize: json.deserialize,
});
const service = { GetItem: method("GetItem"), ListItems: method("ListItems", true), Missing: method("Missing") };

let server: grpc.Server;
let client: grpc.Client & Record<string, (...a: unknown[]) => unknown>;

beforeAll(async () => {
  expect(instrumentGrpc(wl, grpc)).toBe(true);
  server = new grpc.Server();
  server.addService(service, {
    GetItem: (_call: unknown, cb: grpc.sendUnaryData<unknown>) => cb(null, wl.traceDb({ system: "sqlite" }, "SELECT 1", undefined, () => ({ id: 7 }))),
    ListItems: (call: grpc.ServerWritableStream<unknown, unknown>) => (call.write({ id: 1 }), call.write({ id: 2 }), call.end()),
    Missing: (_call: unknown, cb: grpc.sendUnaryData<unknown>) => cb({ code: grpc.status.NOT_FOUND, details: "no such item" }),
  });
  const port = await new Promise<number>((r, j) => server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (e, p) => (e ? j(e) : r(p))));
  const Client = grpc.makeGenericClientConstructor(service, "Items");
  client = new Client(`127.0.0.1:${port}`, grpc.credentials.createInsecure()) as typeof client;
});
afterAll(() => (client.close(), server.forceShutdown()));

/** Run a call inside a parent span (like a request) and return the spans of its trace. */
async function traced(run: () => Promise<unknown>): Promise<Span[]> {
  const parent = wl.tracer.startSpan("GET /parent");
  await context.with(trace.setSpan(context.active(), parent), run).catch(() => undefined);
  parent.end();
  await new Promise((r) => setTimeout(r, 30));
  return wl.store.get(parent.spanContext().traceId)!.spans;
}

const unary = (name: string) => () => new Promise((r, j) => client[name]!({ id: 7 }, (e: unknown, v: unknown) => (e ? j(e) : r(v))));

describe("grpc", () => {
  it("joins client and server in one trace with rpc attributes", async () => {
    const spans = await traced(unary("GetItem"));
    const out = spans.find((s) => s.category === "http.client")!;
    const inn = spans.find((s) => s.category === "http.server")!;
    expect(out).toMatchObject({ name: "shop.v1.Items/GetItem", kind: "client" });
    expect(out.attributes).toMatchObject({ "rpc.system": "grpc", "rpc.service": "shop.v1.Items", "rpc.method": "GetItem", "rpc.grpc.status_code": 0, "server.address": "127.0.0.1" });
    expect(inn).toMatchObject({ parentSpanId: out.spanId, kind: "server", status: "unset" });
    expect(inn.attributes).toMatchObject({ "http.route": "/shop.v1.Items/GetItem", "rpc.grpc.status_code": 0 });
    expect(spans.find((s) => s.category === "db")!.parentSpanId).toBe(inn.spanId);
  });

  it("traces server streams until they finish", async () => {
    const stream = () => new Promise((r) => (client.ListItems!({}) as grpc.ClientReadableStream<unknown>).on("data", () => undefined).on("end", r));
    const spans = await traced(stream);
    expect(spans.filter((s) => s.attributes["rpc.method"] === "ListItems").map((s) => s.attributes["rpc.grpc.status_code"])).toEqual([0, 0]);
  });

  it("marks failed calls on both sides", async () => {
    const spans = await traced(unary("Missing"));
    const failed = spans.filter((s) => s.attributes["rpc.method"] === "Missing");
    expect(failed.map((s) => [s.category, s.status, s.attributes["rpc.grpc.status_code"]])).toEqual(
      expect.arrayContaining([["http.client", "error", 5], ["http.server", "error", 5]]),
    );
  });
});
