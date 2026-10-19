import { context, trace } from "@opentelemetry/api";
import type { Span } from "@wizeworks/lens-core";
import { describe, expect, it } from "vitest";
import { createWizeLens } from "../wizelens.js";
import { instrumentBullMq } from "./bullmq.js";

const wl = createWizeLens({ serviceName: "bullmq", storage: "memory", instrumentFetch: false });
const TRACED = Symbol.for("wizeworks.wizelens.traced");
const isTraced = (fn: unknown) => !!(fn as Record<symbol, unknown>)[TRACED];
const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const query = () => wl.traceDb({ system: "sqlite" }, "INSERT INTO audit VALUES (1)", undefined, () => []);

interface Opts {
  attempts?: number;
  repeat?: object;
  telemetry?: { metadata?: string };
}
interface Job {
  id: string;
  name: string;
  queueName: string;
  attemptsMade: number;
  opts?: Opts;
}
interface Flow {
  name: string;
  queueName: string;
  opts?: Opts;
  children?: Flow[];
}

// Shaped like BullMQ: the queue name is `name`, and the Worker runs its processor through callProcessJob.
class Queue {
  jobs: Job[] = [];
  constructor(readonly name: string) {}
  async add(name: string, _data: unknown, opts?: Opts) {
    const job = { id: String(this.jobs.length + 1), name, queueName: this.name, attemptsMade: 0, opts };
    this.jobs.push(job);
    return job;
  }
  async addBulk(jobs: { name: string; data: unknown; opts?: Opts }[]) {
    return jobs.map((j) => this.jobs[this.jobs.push({ id: String(this.jobs.length + 1), name: j.name, queueName: this.name, attemptsMade: 0, opts: j.opts }) - 1]);
  }
}
class Worker {
  constructor(readonly name: string, private readonly processor: (job: Job) => Promise<unknown>) {}
  callProcessJob(job: Job, _token: string) {
    return this.processor(job);
  }
}
class FlowProducer {
  flows: Flow[] = [];
  async add(flow: Flow) {
    this.flows.push(flow);
    return { job: { id: "f1" } };
  }
  async addBulk(flows: Flow[]) {
    this.flows.push(...flows);
    return [];
  }
  getFlow() {}
}

const bullmq = { Queue, Worker, FlowProducer };
const traceparentOf = (opts?: Opts) => (JSON.parse(opts?.telemetry?.metadata ?? "{}") as { traceparent?: string }).traceparent;

/** Run `send` inside a request span and return the request's trace id. */
async function inRequest(send: () => unknown): Promise<{ traceId: string; spans: () => Span[] }> {
  const parent = wl.tracer.startSpan("POST /signup");
  await context.with(trace.setSpan(context.active(), parent), async () => void (await send()));
  parent.end();
  const { traceId } = parent.spanContext();
  return { traceId, spans: () => wl.store.get(traceId)!.spans };
}

const one = (spans: Span[], kind: string) => spans.filter((s) => s.kind === kind);

describe("bullmq", () => {
  it("patches the Queue, Worker, and FlowProducer classes", () => {
    expect(instrumentBullMq(wl, bullmq)).toBe(true);
    expect([Queue.prototype.add, Queue.prototype.addBulk, Worker.prototype.callProcessJob, FlowProducer.prototype.add].every(isTraced)).toBe(true);
    expect(instrumentBullMq(wl, {})).toBe(false);
    expect(instrumentBullMq(createWizeLens({ serviceName: "off", enabled: false }), { Queue: class {} })).toBe(false);
  });

  it("joins Queue.add and the worker in one trace, without the queue wait stretching the request", async () => {
    const queue = new Queue("emails");
    const opts = { attempts: 3 };
    const req = await inRequest(() => queue.add("welcome", { to: "a@b.c" }, opts));
    expect(opts).toEqual({ attempts: 3 });
    expect(traceparentOf(queue.jobs[0]!.opts)).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    await settle(40);
    await new Worker("emails", async () => void query()).callProcessJob(queue.jobs[0]!, "token");
    await settle();
    const spans = req.spans();
    const [send, process] = [one(spans, "producer")[0]!, one(spans, "consumer")[0]!];
    expect(send).toMatchObject({ name: "send emails", category: "messaging" });
    expect(send.attributes).toMatchObject({ "messaging.system": "bullmq", "messaging.destination.name": "emails", "messaging.operation.name": "add", "messaging.bullmq.job.name": "welcome", "messaging.message.id": "1" });
    expect(process).toMatchObject({ name: "process emails", parentSpanId: send.spanId, status: "unset" });
    expect(process.attributes).toMatchObject({ "messaging.operation.type": "process", "messaging.message.id": "1", "messaging.bullmq.job.attempt": 1, "messaging.bullmq.job.attempts": 3 });
    expect(spans.find((s) => s.category === "db")!.parentSpanId).toBe(process.spanId);
    const request = spans.find((s) => s.name === "POST /signup")!;
    expect(request.durationMs).toBeLessThan(40);
    expect(process.startMs).toBeGreaterThanOrEqual(send.startMs + send.durationMs);
  });
});

describe("bullmq bulk and flows", () => {
  it("addBulk sends one span and stamps every job", async () => {
    const queue = new Queue("reports");
    const req = await inRequest(() => queue.addBulk([{ name: "daily", data: 1 }, { name: "weekly", data: 2 }]));
    expect(queue.jobs.map((j) => traceparentOf(j.opts))).toEqual([expect.any(String), expect.any(String)]);
    await new Worker("reports", async () => undefined).callProcessJob(queue.jobs[1]!, "t");
    await settle();
    const send = one(req.spans(), "producer");
    expect(send).toHaveLength(1);
    expect(send[0]!.attributes).toMatchObject({ "messaging.batch.message_count": 2, "messaging.operation.name": "addBulk" });
    expect(send[0]!.attributes["messaging.bullmq.job.name"]).toBeUndefined();
    expect(one(req.spans(), "consumer")[0]).toMatchObject({ parentSpanId: send[0]!.spanId, attributes: { "messaging.bullmq.job.name": "weekly" } });
  });

  it("FlowProducer.add stamps every job of the tree", async () => {
    const flows = new FlowProducer();
    const tree = { name: "ship", queueName: "orders", children: [{ name: "pack", queueName: "warehouse" }, { name: "bill", queueName: "invoices" }] };
    const req = await inRequest(() => flows.add(tree));
    const sent = flows.flows[0]!;
    expect([sent, ...sent.children!].map((f) => typeof traceparentOf(f.opts))).toEqual(["string", "string", "string"]);
    expect(tree.children[0]).toEqual({ name: "pack", queueName: "warehouse" });
    const child = { id: "c1", name: "pack", queueName: "warehouse", attemptsMade: 0, opts: sent.children![0]!.opts };
    await new Worker("warehouse", async () => undefined).callProcessJob(child, "t");
    await settle();
    const send = one(req.spans(), "producer")[0]!;
    expect(send.attributes).toMatchObject({ "messaging.destination.name": "orders, warehouse, invoices", "messaging.batch.message_count": 3, "messaging.bullmq.job.name": "ship" });
    expect(one(req.spans(), "consumer")[0]).toMatchObject({ name: "process warehouse", parentSpanId: send.spanId });
  });
});

describe("bullmq failures and edges", () => {
  it("records a failed attempt, and a job BullMQ moves (delayed) as no failure", async () => {
    const queue = new Queue("emails");
    const req = await inRequest(() => queue.add("welcome", {}, { attempts: 3 }));
    const job = { ...queue.jobs[0]!, attemptsMade: 2 };
    const worker = new Worker("emails", async () => {
      throw new Error("smtp down");
    });
    await expect(worker.callProcessJob(job, "t")).rejects.toThrow("smtp down");
    const delayed = Object.assign(new Error("moved"), { name: "DelayedError" });
    await expect(new Worker("emails", () => Promise.reject(delayed)).callProcessJob(job, "t")).rejects.toBe(delayed);
    await settle();
    const [failed, moved] = one(req.spans(), "consumer");
    expect(failed).toMatchObject({ status: "error", statusMessage: "smtp down", attributes: { "messaging.bullmq.job.attempt": 3, "messaging.bullmq.job.attempts": 3 } });
    expect(failed!.events.some((e) => e.name === "exception")).toBe(true);
    expect(moved).toMatchObject({ status: "unset", events: [] });
  });

  it("leaves repeating jobs and jobs added outside a request without a trace", async () => {
    const queue = new Queue("cron");
    await inRequest(() => queue.add("nightly", {}, { repeat: { pattern: "0 0 * * *" } }));
    await queue.add("loose", {});
    expect(queue.jobs.map((j) => j.opts?.telemetry)).toEqual([undefined, undefined]);
    let traceId = "";
    await new Worker("cron", async () => void (traceId = trace.getSpan(context.active())!.spanContext().traceId)).callProcessJob(queue.jobs[1]!, "t");
    await settle();
    expect(wl.store.get(traceId)!.spans[0]).toMatchObject({ name: "process cron", kind: "consumer", parentSpanId: null });
  });
});
