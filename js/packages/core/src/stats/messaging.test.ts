import { describe, expect, it } from "vitest";
import { makeRequest, makeSpan } from "../testing/fixtures.js";
import { buildTrace } from "../trace.js";
import { messageRows } from "./messaging.js";
import { requestOf } from "./requests.js";
import { serviceEdges, serviceRows } from "./services.js";
import { traceLayers } from "./traces.js";

const messaging = { "messaging.system": "rabbitmq", "messaging.destination.name": "orders" };

function sendAndHandle() {
  const api = makeRequest({ service: "api", serverMs: 40, startMs: 1000 });
  const server = api.spans[0]!;
  const send = makeSpan({ traceId: api.traceId, category: "messaging", kind: "producer", service: "api", parentSpanId: server.spanId, startMs: 1010, durationMs: 2, attributes: { ...messaging, "messaging.operation.type": "send" } });
  const handle = makeSpan({ traceId: api.traceId, category: "messaging", kind: "consumer", service: "billing", parentSpanId: send.spanId, startMs: 1030, durationMs: 15, attributes: { ...messaging, "messaging.operation.type": "process" } });
  return buildTrace(api.traceId, [...api.spans, send, handle], [], []);
}

describe("messaging stats", () => {
  it("lists queues and workers and links them", () => {
    const t = sendAndHandle();
    const rows = serviceRows([t]);
    expect(rows.find((r) => r.kind === "queue")).toMatchObject({ name: "rabbitmq · orders", requests: 1 });
    expect(rows.find((r) => r.kind === "worker")).toMatchObject({ name: "billing", requests: 1 });
    const edges = serviceEdges([t]).map((e) => `${e.from}→${e.to}`);
    expect(edges).toEqual(expect.arrayContaining(["api→rabbitmq · orders", "rabbitmq · orders→billing"]));
  });

  it("shows the send, the wait in the queue, and the handler in the timeline", () => {
    const layers = traceLayers(sendAndHandle());
    expect(layers.find((l) => l.key === "queue:rabbitmq · orders")?.totalMs).toBe(2);
    expect(layers.find((l) => l.key === "wait:rabbitmq · orders")?.totalMs).toBe(18);
    expect(layers.find((l) => l.key === "service:billing")?.totalMs).toBe(15);
    expect(messageRows(sendAndHandle().spans).map((m) => m.operation)).toEqual(["send", "process"]);
  });

  it("names the message by its RabbitMQ routing key, and leaves it empty without one", () => {
    const t = sendAndHandle();
    t.spans.find((s) => s.kind === "producer")!.attributes["messaging.rabbitmq.destination.routing_key"] = "OrderStartedIntegrationEvent";
    expect(messageRows(t.spans).map((m) => m.message)).toEqual(["OrderStartedIntegrationEvent", null]);
  });
});

describe("gRPC requests", () => {
  it("reads gRPC as the method and service/method as the path", () => {
    const t = makeRequest({ attributes: { "rpc.system": "grpc", "rpc.service": "orders.v1.Orders", "rpc.method": "GetOrder" } });
    expect(requestOf(t)).toMatchObject({ method: "gRPC", path: "/orders.v1.Orders/GetOrder", endpoint: "gRPC orders.v1.Orders/GetOrder" });
  });
});
