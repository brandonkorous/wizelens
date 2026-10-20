import { context, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { TraceState } from "@opentelemetry/core";
import type { Span } from "@wizeworks/lens-core";
import { describe, expect, it } from "vitest";
import { createWizeLens } from "../wizelens.js";
import { instrumentSqs } from "./sqs.js";
import { processSqsMessage, type SqsAttributes, type SqsMessage } from "./sqs-message.js";

const wl = createWizeLens({ serviceName: "sqs", storage: "memory", instrumentFetch: false });
const TRACED = Symbol.for("wizeworks.wizelens.traced");
const settle = () => new Promise((r) => setTimeout(r, 20));
const query = () => wl.traceDb({ system: "sqlite" }, "INSERT INTO audit VALUES (1)", undefined, () => []);
const URL = "https://sqs.us-east-1.amazonaws.com/123456789012/orders";

type Input = Record<string, unknown> & { MessageAttributes?: SqsAttributes; Entries?: Input[]; MessageAttributeNames?: string[] };
// The real commands are classes that keep their input on `input`.
class SendMessageCommand { constructor(readonly input: Input) {} }
class SendMessageBatchCommand { constructor(readonly input: Input) {} }
class ReceiveMessageCommand { constructor(readonly input: Input) {} }
class DeleteMessageCommand { constructor(readonly input: Input) {} }

/** A queue in memory. Like SQS, ReceiveMessage returns only the message attributes it was asked for. */
function fakeClient() {
  return class SQSClient {
    calls: { input: Input }[] = [];
    queue: SqsMessage[] = [];
    async send(command: { input: Input }) {
      this.calls.push(command);
      const { input } = command;
      if (input.Entries) return { Successful: input.Entries.filter((e) => e.Id !== "bad"), Failed: input.Entries.filter((e) => e.Id === "bad") };
      if ("MessageBody" in input) {
        const MessageId = `m${this.queue.length + 1}`;
        this.queue.push({ MessageId, Body: String(input.MessageBody), MessageAttributes: input.MessageAttributes });
        return { MessageId };
      }
      if ("ReceiptHandle" in input) return {};
      const names = input.MessageAttributeNames ?? [];
      const asked = (m: SqsMessage) => Object.fromEntries(Object.entries(m.MessageAttributes ?? {}).filter(([k]) => names.includes(k)));
      return { Messages: this.queue.splice(0, 1).map((m) => ({ ...m, MessageAttributes: asked(m) })) };
    }
  };
}

const sqsModule = (SQSClient: unknown) => ({ SQSClient, SendMessageCommand, SendMessageBatchCommand, ReceiveMessageCommand });

/** Run `send` inside a request span; `spans()` reads the request's trace. */
async function inRequest(send: () => unknown, parentCtx = context.active()) {
  const parent = wl.tracer.startSpan("POST /orders", {}, parentCtx);
  await context.with(trace.setSpan(parentCtx, parent), async () => void (await send()));
  parent.end();
  const { traceId } = parent.spanContext();
  return { traceId, spans: (): Span[] => wl.store.get(traceId)!.spans };
}

describe("aws sqs", () => {
  it("patches SQSClient.prototype.send from the module", () => {
    const SQSClient = fakeClient();
    expect(instrumentSqs(wl, sqsModule(SQSClient))).toBe(true);
    expect((SQSClient.prototype.send as unknown as Record<symbol, unknown>)[TRACED]).toBe(true);
    expect(instrumentSqs(wl, {})).toBe(false);
  });

  it("joins SendMessage, ReceiveMessage, and processSqsMessage in one trace", async () => {
    const SQSClient = fakeClient();
    instrumentSqs(wl, sqsModule(SQSClient));
    const client = new SQSClient();
    const input = { QueueUrl: URL, MessageBody: "hello" };
    const req = await inRequest(() => client.send(new SendMessageCommand(input)));
    expect(input).toEqual({ QueueUrl: URL, MessageBody: "hello" });
    expect(client.calls[0]!.input.MessageAttributes!.traceparent).toMatchObject({ DataType: "String", StringValue: expect.stringMatching(/^00-/) });
    const received = (await client.send(new ReceiveMessageCommand({ QueueUrl: URL }))) as { Messages: SqsMessage[] };
    expect(client.calls[1]!.input.MessageAttributeNames).toEqual(["traceparent", "tracestate"]);
    await processSqsMessage(wl, received.Messages[0]!, async () => void query());
    await settle();
    const spans = req.spans();
    const send = spans.find((s) => s.kind === "producer")!;
    expect(send).toMatchObject({ name: "send orders", category: "messaging" });
    expect(send.attributes).toMatchObject({ "messaging.system": "aws_sqs", "messaging.destination.name": "orders", "messaging.operation.name": "SendMessage", "messaging.message.id": "m1", "messaging.message.body.size": 5 });
    const receive = spans.find((s) => s.name === "receive orders")!;
    expect(receive).toMatchObject({ kind: "consumer", parentSpanId: send.spanId, attributes: { "messaging.batch.message_count": 1, "messaging.message.id": "m1" } });
    const process = spans.find((s) => s.name === "process orders")!;
    expect(process).toMatchObject({ kind: "consumer", parentSpanId: send.spanId, attributes: { "messaging.operation.type": "process", "messaging.message.id": "m1" } });
    expect(spans.find((s) => s.category === "db")!.parentSpanId).toBe(process.spanId);
  });
});

describe("aws sqs batches", () => {
  it("SendMessageBatch: one span, every entry stamped, a partial failure is an error", async () => {
    const SQSClient = fakeClient();
    instrumentSqs(wl, sqsModule(SQSClient));
    const client = new SQSClient();
    const entries = [{ Id: "a", MessageBody: "1" }, { Id: "bad", MessageBody: "2" }, { Id: "c", MessageBody: "3" }];
    const req = await inRequest(() => client.send(new SendMessageBatchCommand({ QueueUrl: URL, Entries: entries })));
    expect(client.calls[0]!.input.Entries!.every((e) => e.MessageAttributes?.traceparent)).toBe(true);
    await settle();
    const send = req.spans().filter((s) => s.kind === "producer");
    expect(send).toHaveLength(1);
    expect(send[0]).toMatchObject({ status: "error", statusMessage: "1 of 3 messages failed" });
    expect(send[0]!.attributes).toMatchObject({ "messaging.batch.message_count": 3, "messaging.aws_sqs.batch.failed_count": 1, "messaging.operation.name": "SendMessageBatch" });
  });

  it("keeps each message within the 10-attribute limit", async () => {
    const SQSClient = fakeClient();
    instrumentSqs(wl, sqsModule(SQSClient));
    const client = new SQSClient();
    const attrs = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`a${i}`, { DataType: "String", StringValue: "x" }]));
    const entries = [10, 9, 0].map((n, i) => ({ Id: String(i), MessageBody: "x", MessageAttributes: n ? attrs(n) : undefined }));
    const remote = trace.wrapSpanContext({ traceId: "1".repeat(32), spanId: "2".repeat(16), traceFlags: 1, isRemote: true, traceState: new TraceState("shop=1") });
    await inRequest(() => client.send(new SendMessageBatchCommand({ QueueUrl: URL, Entries: entries })), trace.setSpan(ROOT_CONTEXT, remote));
    const sent = client.calls[0]!.input.Entries!.map((e) => Object.keys(e.MessageAttributes ?? {}));
    expect(sent.map((keys) => keys.length)).toEqual([10, 10, 2]);
    expect(sent[0]).not.toContain("traceparent");
    expect(sent[1]).toContain("traceparent");
    expect(sent[2]).toEqual(["traceparent", "tracestate"]);
    expect(client.calls[0]!.input.Entries![2]!.MessageAttributes!.tracestate!.StringValue).toBe("shop=1");
  });
});

describe("aws sqs consumers and edges", () => {
  it("joins a Lambda SQS record to its producer and names the queue from the ARN", async () => {
    const producer = wl.tracer.startSpan("send orders");
    const { traceId, spanId } = producer.spanContext();
    producer.end();
    const record = { messageId: "r1", body: "{}", attributes: { ApproximateReceiveCount: "2" }, messageAttributes: { traceparent: { stringValue: `00-${traceId}-${spanId}-01`, dataType: "String" } }, eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:orders" };
    expect(processSqsMessage(wl, record, (m) => m.messageId)).toBe("r1");
    await settle();
    const process = wl.store.get(traceId)!.spans.find((s) => s.name === "process orders")!;
    expect(process).toMatchObject({ kind: "consumer", parentSpanId: spanId, attributes: { "messaging.message.id": "r1", "messaging.aws_sqs.receive_count": 2 } });
  });

  it("matches commands by class from the module, passes other commands through, and keeps the callback form", async () => {
    const SQSClient = fakeClient();
    const Renamed = class { constructor(readonly input: Input) {} };
    instrumentSqs(wl, { SQSClient, SendMessageCommand: Renamed });
    const client = new SQSClient();
    const del = new DeleteMessageCommand({ QueueUrl: URL, ReceiptHandle: "h" });
    let out: unknown;
    const req = await inRequest(async () => {
      await client.send(del);
      await new Promise<void>((done) => (client.send as (c: unknown, cb: (e: unknown, o: unknown) => void) => void)(new Renamed({ QueueUrl: URL, MessageBody: "x" }), (_e, o) => ((out = o), done())));
    });
    expect(client.calls[0]).toBe(del);
    expect(out).toEqual({ MessageId: "m1" });
    await settle();
    expect(req.spans().filter((s) => s.category === "messaging").map((s) => s.name)).toEqual(["send orders"]);
  });

  it("records nothing for an empty receive", async () => {
    const SQSClient = fakeClient();
    instrumentSqs(wl, sqsModule(SQSClient));
    const client = new SQSClient();
    const before = wl.store.all().length;
    expect(await client.send(new ReceiveMessageCommand({ QueueUrl: URL, MessageAttributeNames: ["All"] }))).toEqual({ Messages: [] });
    expect(client.calls[0]!.input.MessageAttributeNames).toEqual(["All"]);
    await settle();
    expect(wl.store.all().length).toBe(before);
  });
});
