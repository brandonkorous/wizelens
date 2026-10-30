import { context, trace } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import { createWizeLens } from "../wizelens.js";
import { instrumentAmqplib } from "./amqplib.js";
import { instrumentServiceBus } from "./servicebus.js";

const wl = createWizeLens({ service: "pull", storage: "memory", instrumentFetch: false });
const settle = () => new Promise((r) => setTimeout(r, 20));

/** A traceparent header from a producer span, as a sender would write it. */
function producerHeaders(): { headers: Record<string, unknown>; traceId: string; spanId: string } {
  const send = wl.tracer.startSpan("send orders");
  const { traceId, spanId } = send.spanContext();
  send.end();
  return { headers: { traceparent: `00-${traceId}-${spanId}-01` }, traceId, spanId };
}

describe("pulled messages", () => {
  it("records a receive span for amqplib channel.get, joined to the producer", async () => {
    const sent = producerHeaders();
    class PullChannel {
      publish() {
        return true;
      }
      consume() {}
      async get(_queue: string) {
        return { content: Buffer.from("x"), properties: { headers: sent.headers, messageId: "m1" } };
      }
    }
    const channel = new PullChannel();
    expect(instrumentAmqplib(wl, channel)).toBe(true);
    await channel.get("orders");
    await settle();
    const receive = wl.store.get(sent.traceId)!.spans.find((s) => s.name === "receive orders")!;
    expect(receive).toMatchObject({ kind: "consumer", category: "messaging", parentSpanId: sent.spanId });
    expect(receive.attributes).toMatchObject({ "messaging.system": "rabbitmq", "messaging.message.id": "m1" });
  });

  it("records one receive span per Service Bus receiveMessages batch", async () => {
    const sent = producerHeaders();
    const messages = [{ body: "a", messageId: "1", applicationProperties: sent.headers }];
    const client = { createSender: () => ({}), createReceiver: (entityPath: string) => ({ entityPath, subscribe() {}, receiveMessages: async () => messages }) };
    expect(instrumentServiceBus(wl, client)).toBe(true);
    await context.with(trace.setSpan(context.active(), wl.tracer.startSpan("job")), () => client.createReceiver("orders").receiveMessages());
    await settle();
    const receive = wl.store.get(sent.traceId)!.spans.find((s) => s.name === "receive orders")!;
    expect(receive).toMatchObject({ kind: "consumer", parentSpanId: sent.spanId });
    expect(receive.attributes).toMatchObject({ "messaging.system": "servicebus", "messaging.batch.message_count": 1, "messaging.operation.type": "receive" });
  });
});
