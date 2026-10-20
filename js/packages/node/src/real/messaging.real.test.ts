import * as sqs from "@aws-sdk/client-sqs";
import axios from "axios";
import * as bullmq from "bullmq";
import { afterAll, describe, expect, it } from "vitest";
import { instrumentBullMq } from "../messaging/bullmq.js";
import { instrumentSqs } from "../messaging/sqs.js";
import { processSqsMessage } from "../messaging/sqs-message.js";
import { startApp } from "../test/helpers.js";
import { inRequest, REAL, REAL_URLS, realLens, spansOf, traceOf, unique } from "./real.js";

const wizelens = realLens("real-messaging");
const closers: (() => Promise<unknown>)[] = [];
afterAll(async () => {
  for (const close of closers) await close().catch(() => undefined);
  await wizelens.shutdown();
});

const redisConnection = () => {
  const u = new URL(REAL_URLS.redis);
  return { host: u.hostname, port: Number(u.port || 6379), maxRetriesPerRequest: null };
};

describe.skipIf(!REAL)("real messaging", () => {
  it("bullmq: a job added in a request runs in a worker as part of the same trace", async () => {
    expect(instrumentBullMq(wizelens, bullmq)).toBe(true);
    const name = unique("emails-");
    const queue = new bullmq.Queue(name, { connection: redisConnection() });
    let done!: () => void;
    const ran = new Promise<void>((r) => (done = r));
    const worker = new bullmq.Worker(name, async () => void done(), { connection: redisConnection() });
    closers.push(() => worker.close(), () => queue.obliterate({ force: true }).then(() => queue.close()));
    const trace = await inRequest(wizelens, () => queue.add("welcome", { to: "x" }));
    await ran;
    const full = await traceOf(wizelens, (t) => t.traceId === trace.traceId && spansOf(t, "messaging").length >= 2, 300);
    const msg = spansOf(full, "messaging");
    expect(msg.map((s) => s.kind).sort()).toEqual(["consumer", "producer"]);
    expect(msg.every((s) => s.attributes["messaging.system"] === "bullmq")).toBe(true);
  });

  it("sqs: a message sent in a request is processed in the sender's trace", async () => {
    expect(instrumentSqs(wizelens, sqs)).toBe(true);
    const client = new sqs.SQSClient({ endpoint: REAL_URLS.sqs, region: "us-east-1", credentials: { accessKeyId: "x", secretAccessKey: "x" } });
    const { QueueUrl } = await client.send(new sqs.CreateQueueCommand({ QueueName: unique("orders-") }));
    const trace = await inRequest(wizelens, () => client.send(new sqs.SendMessageCommand({ QueueUrl, MessageBody: "{}" })));
    const { Messages = [] } = await client.send(new sqs.ReceiveMessageCommand({ QueueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: 2 }));
    expect(Messages).toHaveLength(1);
    await processSqsMessage(wizelens, Messages[0]!, async () => undefined);
    const full = await traceOf(wizelens, (t) => t.traceId === trace.traceId && spansOf(t, "messaging").some((s) => s.name.startsWith("process")));
    expect(spansOf(full, "messaging").map((s) => s.name.split(" ")[0])).toEqual(expect.arrayContaining(["send", "process"]));
  });

  it("axios: a call made in a request is a client span with traceparent", async () => {
    let seen = "";
    const downstream = await startApp(realLens("real-downstream"), (a) => a.get("/x", (req, res) => void ((seen = String(req.headers.traceparent ?? "")), res.json({ ok: true }))));
    closers.push(() => downstream.close());
    const trace = await inRequest(wizelens, () => axios.get(`${downstream.base}/x`));
    const client = spansOf(trace, "http.client");
    expect(client).toHaveLength(1);
    expect(client[0]!.attributes["http.response.status_code"]).toBe(200);
    expect(seen).toContain(trace.traceId);
  });
});
