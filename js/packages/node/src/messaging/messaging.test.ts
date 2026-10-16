import { ServiceBusClient } from "@azure/service-bus";
import amqplib from "amqplib";
import * as kafkajs from "kafkajs";
import { context, trace } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import type { Span } from "@wizeworks/lens-core";
import { createWizeLens } from "../wizelens.js";
import { instrumentAmqplib } from "./amqplib.js";
import { instrumentKafkaJs } from "./kafkajs.js";
import { instrumentServiceBus } from "./servicebus.js";

const wl = createWizeLens({ serviceName: "messaging", storage: "memory", instrumentFetch: false });
const TRACED = Symbol.for("wizeworks.wizelens.traced");
const isTraced = (fn: unknown) => !!(fn as Record<symbol, unknown>)[TRACED];

/** Send inside a request span, then handle the message; returns the spans of the request's trace. */
async function flow(send: () => unknown, handle: () => unknown): Promise<Span[]> {
  const parent = wl.tracer.startSpan("POST /orders");
  await context.with(trace.setSpan(context.active(), parent), async () => void (await send()));
  parent.end();
  await handle();
  await new Promise((r) => setTimeout(r, 20));
  return wl.store.get(parent.spanContext().traceId)!.spans;
}

const query = () => wl.traceDb({ system: "sqlite" }, "INSERT INTO audit VALUES (1)", undefined, () => []);

function expectJoined(spans: Span[], system: string, destination: string): void {
  const send = spans.find((s) => s.kind === "producer")!;
  const process = spans.find((s) => s.kind === "consumer")!;
  expect(send).toMatchObject({ category: "messaging", name: `send ${destination}` });
  expect(send.attributes).toMatchObject({ "messaging.system": system, "messaging.operation.type": "send", "messaging.destination.name": destination });
  expect(process).toMatchObject({ category: "messaging", name: `process ${destination}`, parentSpanId: send.spanId });
  expect(spans.filter((s) => s.kind === "producer")).toHaveLength(1);
  expect(spans.find((s) => s.category === "db")!.parentSpanId).toBe(process.spanId);
}

describe("rabbitmq (amqplib)", () => {
  class FakeChannel {
    sent: { content: unknown; properties: { headers?: Record<string, unknown> } }[] = [];
    onMessage: ((m: unknown) => unknown) | null = null;
    publish(_exchange: string, _key: string, content: unknown, options?: { headers?: Record<string, unknown> }) {
      this.sent.push({ content, properties: { headers: options?.headers } });
      return true;
    }
    sendToQueue(queue: string, content: unknown, options?: object) {
      return this.publish("", queue, content, options);
    }
    consume(_queue: string, onMessage: (m: unknown) => unknown) {
      this.onMessage = onMessage;
    }
  }
  class FakeConfirmChannel extends FakeChannel {
    override publish(exchange: string, key: string, content: unknown, options?: { headers?: Record<string, unknown> }) {
      return super.publish(exchange, key, content, options);
    }
  }

  it("patches the real module", () => expect(instrumentAmqplib(wl, amqplib)).toBe(true));

  it("joins publish and consume in one trace, counting a nested publish once", async () => {
    instrumentAmqplib(wl, new FakeChannel());
    const ch = new FakeConfirmChannel();
    instrumentAmqplib(wl, ch);
    ch.consume("orders", () => query());
    const spans = await flow(() => ch.sendToQueue("orders", Buffer.from("hi")), () => ch.onMessage!(ch.sent[0]));
    expectJoined(spans, "rabbitmq", "orders");
    expect(spans.find((s) => s.kind === "producer")!.attributes["messaging.message.body.size"]).toBe(2);
  });
});

describe("kafka (kafkajs)", () => {
  const sent: { topic: string; messages: { headers?: Record<string, unknown> }[] }[] = [];
  let eachMessage: ((p: unknown) => Promise<void>) | undefined;
  const producer = { send: async (r: (typeof sent)[0]) => void sent.push(r), sendBatch: async () => undefined };
  const consumer = { subscribe: async () => undefined, run: async (c: { eachMessage: typeof eachMessage }) => void (eachMessage = c.eachMessage) };

  it("patches the real Kafka class", () => {
    expect(instrumentKafkaJs(wl, kafkajs)).toBe(true);
    const kafka = new kafkajs.Kafka({ brokers: ["127.0.0.1:1"], logLevel: kafkajs.logLevel.NOTHING });
    expect(isTraced(kafka.producer().send)).toBe(true);
    expect(isTraced(kafka.consumer({ groupId: "g" }).run)).toBe(true);
  });

  it("joins send and eachMessage through the headers", async () => {
    const kafka = { producer: () => producer, consumer: () => consumer };
    instrumentKafkaJs(wl, kafka);
    await kafka.consumer().run({ eachMessage: async () => void query() });
    const spans = await flow(
      () => kafka.producer().send({ topic: "orders", messages: [{}] }),
      () => eachMessage!({ topic: "orders", partition: 0, message: { ...sent[0]!.messages[0], headers: { traceparent: Buffer.from(String(sent[0]!.messages[0]!.headers!.traceparent)) } } }),
    );
    expectJoined(spans, "kafka", "orders");
  });
});

describe("azure service bus", () => {
  it("patches a real client", async () => {
    const client = new ServiceBusClient("Endpoint=sb://example.servicebus.windows.net/;SharedAccessKeyName=k;SharedAccessKey=dGVzdA==");
    expect(instrumentServiceBus(wl, client)).toBe(true);
    expect(isTraced(client.createSender("orders").sendMessages)).toBe(true);
    await client.close();
  });

  it("joins sendMessages and processMessage through application properties", async () => {
    const sent: { applicationProperties?: Record<string, unknown> }[] = [];
    let handlers: { processMessage(m: unknown): Promise<void> } | undefined;
    const client = {
      createSender: (entityPath: string) => ({ entityPath, sendMessages: async (m: (typeof sent)[0]) => void sent.push(m) }),
      createReceiver: (entityPath: string) => ({ entityPath, subscribe: (h: typeof handlers) => void (handlers = h) }),
    };
    instrumentServiceBus(wl, client);
    client.createReceiver("orders").subscribe({ processMessage: async () => void query() });
    const sender = client.createSender("orders");
    const spans = await flow(() => sender.sendMessages({ body: "hi" } as (typeof sent)[0]), () => handlers!.processMessage(sent[0]));
    expectJoined(spans, "servicebus", "orders");
  });
});
