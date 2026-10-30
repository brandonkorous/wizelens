import type { Attributes, Context, Span as OtelSpan, Tracer } from "@opentelemetry/api";
import { ATTR_MESSAGING } from "@wizeworks/lens-core/internal";
import { captureOf, patchMethod } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { injectInto, OPERATION_NAME, runInSpan, startConsumer, startProducer, tap } from "./shared.js";

interface JobOpts {
  repeat?: unknown;
  attempts?: number;
  delay?: number;
  telemetry?: { metadata?: string; omitContext?: boolean };
}
interface JobLike {
  id?: string | number;
  name?: string;
  queueName?: string;
  attemptsMade?: number;
  opts?: JobOpts;
}
interface BulkJob {
  name: string;
  opts?: JobOpts;
}
interface FlowJob extends BulkJob {
  queueName: string;
  children?: FlowJob[];
}
type Named = { name?: unknown };

const JOB_NAME = "messaging.bullmq.job.name";
const JOB_ATTEMPT = "messaging.bullmq.job.attempt";
const JOB_ATTEMPTS = "messaging.bullmq.job.attempts";
const JOB_DELAY = "messaging.bullmq.job.delay";
/** Errors BullMQ uses to move a job (delay it, wait for children, rate limit): not failures. */
const MOVES = new Set(["DelayedError", "WaitingChildrenError", "WaitingError", "RateLimitError"]);
const isMove = (err: unknown) => MOVES.has(String((err as Named | null)?.name));

const queueOf = (self: unknown) => String((self as Named | null)?.name ?? "unknown");

/** Job options carrying the trace in BullMQ's own telemetry slot. Repeating and opted-out jobs keep theirs. */
function stamp(ctx: Context, opts: JobOpts | undefined): JobOpts | undefined {
  if (opts?.repeat || opts?.telemetry?.omitContext || opts?.telemetry?.metadata) return opts;
  const carrier: Record<string, unknown> = {};
  injectInto(ctx, carrier);
  return { ...opts, telemetry: { ...opts?.telemetry, metadata: JSON.stringify(carrier) } };
}

/** The trace headers a job carries, or undefined. */
function carrierOf(job: JobLike): Record<string, unknown> | undefined {
  const metadata = job.opts?.telemetry?.metadata;
  if (typeof metadata !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(metadata);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** The job name when every job shares it, plus the delay of a single delayed job. */
function jobAttributes(op: string, jobs: BulkJob[]): Attributes {
  const names = new Set(jobs.map((j) => j.name));
  const a: Attributes = { [OPERATION_NAME]: op };
  if (names.size === 1) a[JOB_NAME] = jobs[0]!.name;
  if (jobs.length === 1 && jobs[0]!.opts?.delay) a[JOB_DELAY] = jobs[0]!.opts.delay;
  return a;
}

const setJobId = (span: OtelSpan) => (job: unknown) => {
  const id = (job as JobLike | null)?.id;
  if (id !== undefined && id !== null) span.setAttribute(ATTR_MESSAGING.messageId, String(id));
};

function patchQueue(proto: object, tracer: Tracer): void {
  patchMethod(proto, "add", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const [name, data, opts] = args as [string, unknown, JobOpts | undefined];
      const open = startProducer(tracer, { system: "bullmq", destination: queueOf(this), extra: jobAttributes("add", [{ name, opts }]) });
      if (!open) return original.apply(this, args);
      const next = [name, data, stamp(open.ctx, opts), ...args.slice(3)];
      return runInSpan(open.span, open.ctx, () => tap(original.apply(this, next), setJobId(open.span)));
    },
  );
  patchMethod(proto, "addBulk", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const jobs = Array.isArray(args[0]) ? (args[0] as BulkJob[]) : [];
      const facts = { system: "bullmq" as const, destination: queueOf(this), batchSize: jobs.length, extra: jobAttributes("addBulk", jobs) };
      const open = startProducer(tracer, facts);
      if (!open) return original.apply(this, args);
      const next = jobs.map((j) => ({ ...j, opts: stamp(open.ctx, j.opts) }));
      return runInSpan(open.span, open.ctx, () => original.apply(this, [next, ...args.slice(1)]));
    },
  );
}

/** Every job of a flow tree, root first. */
const nodesOf = (flow: FlowJob): FlowJob[] => [flow, ...(flow.children ?? []).flatMap(nodesOf)];

const stampFlow = (ctx: Context, flow: FlowJob): FlowJob => ({
  ...flow,
  opts: stamp(ctx, flow.opts),
  ...(flow.children ? { children: flow.children.map((c) => stampFlow(ctx, c)) } : {}),
});

/** One send span for a whole flow (or flows): every job in the tree carries the trace. */
function traceFlows(tracer: Tracer, op: string, flows: FlowJob[], add: (next: FlowJob[]) => unknown): unknown {
  const jobs = flows.flatMap(nodesOf);
  const destination = [...new Set(jobs.map((j) => j.queueName))].join(", ") || "unknown";
  const open = startProducer(tracer, { system: "bullmq", destination, batchSize: jobs.length, extra: jobAttributes(op, flows) });
  if (!open) return add(flows);
  return runInSpan(open.span, open.ctx, () => add(flows.map((f) => stampFlow(open.ctx, f))));
}

function patchFlowProducer(proto: object, tracer: Tracer): void {
  patchMethod(proto, "add", (original) =>
    function (this: unknown, flow: unknown, ...rest: unknown[]) {
      if (!flow || typeof flow !== "object") return original.call(this, flow, ...rest);
      return traceFlows(tracer, "add", [flow as FlowJob], ([next]) => original.call(this, next, ...rest));
    },
  );
  patchMethod(proto, "addBulk", (original) =>
    function (this: unknown, flows: unknown, ...rest: unknown[]) {
      if (!Array.isArray(flows)) return original.call(this, flows, ...rest);
      return traceFlows(tracer, "addBulk", flows as FlowJob[], (next) => original.call(this, next, ...rest));
    },
  );
}

/** Process span facts for one job: queue, id, name, and which attempt this is. */
function processFacts(job: JobLike, queue: string) {
  const extra: Attributes = { [OPERATION_NAME]: "process", [JOB_ATTEMPT]: (job.attemptsMade ?? 0) + 1, [JOB_ATTEMPTS]: job.opts?.attempts ?? 1 };
  if (job.name !== undefined) extra[JOB_NAME] = job.name;
  const messageId = job.id === undefined || job.id === null ? undefined : String(job.id);
  return { system: "bullmq" as const, destination: job.queueName ?? queue, messageId, extra };
}

/** A Worker runs its processor for each job (inline or sandboxed) through `callProcessJob`. */
function patchWorker(target: object, tracer: Tracer): void {
  patchMethod(target, "callProcessJob", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const job = args[0] as JobLike | null;
      if (!job || typeof job !== "object") return original.apply(this, args);
      const { span, ctx } = startConsumer(tracer, processFacts(job, queueOf(this)), carrierOf(job));
      return runInSpan(span, ctx, () => original.apply(this, args), isMove);
    },
  );
}

const CLASSES = [["Queue", patchQueue], ["FlowProducer", patchFlowProducer], ["Worker", patchWorker]] as const;

/** Patch one instance: a Worker, a FlowProducer, or a Queue. */
function patchInstance(t: Record<string, unknown>, tracer: Tracer): boolean {
  if (typeof t.callProcessJob === "function") return (patchWorker(t, tracer), true);
  if (typeof t.getFlow === "function") return (patchFlowProducer(t, tracer), true);
  if (typeof t.add === "function" && typeof t.addBulk === "function") return (patchQueue(t, tracer), true);
  return false;
}

/** Trace BullMQ jobs. Pass the module (or `{ Queue, Worker, FlowProducer }`), or one instance. Returns false when nothing was patched. */
export function instrumentBullMq(wizelens: WizeLens, target: unknown): boolean {
  const t = target as Record<string, unknown> | null;
  if (!captureOf(wizelens) || !t || typeof t !== "object") return false;
  let found = false;
  for (const [name, patch] of CLASSES) {
    const proto = (t[name] as { prototype?: object } | undefined)?.prototype;
    if (proto) (patch(proto, wizelens.tracer), (found = true));
  }
  return found || patchInstance(t, wizelens.tracer);
}
