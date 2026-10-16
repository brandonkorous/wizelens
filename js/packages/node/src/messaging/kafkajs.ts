import type { Tracer } from "@opentelemetry/api";
import { captureOf, patchMethod } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { injectInto, runInSpan, startConsumer, startProducer } from "./shared.js";

interface KafkaMessage {
  headers?: Record<string, unknown>;
  offset?: string;
}
interface TopicMessages {
  topic: string;
  messages: KafkaMessage[];
}
interface EachMessagePayload {
  topic: string;
  message: KafkaMessage;
}
interface EachBatchPayload {
  batch: { topic: string; messages: KafkaMessage[] };
}
interface RunConfig {
  eachMessage?: (p: EachMessagePayload) => Promise<void>;
  eachBatch?: (p: EachBatchPayload) => Promise<void>;
}

const withHeaders = (messages: KafkaMessage[], inject: (h: Record<string, unknown>) => void): KafkaMessage[] =>
  messages.map((m) => {
    const headers = { ...m.headers };
    inject(headers);
    return { ...m, headers };
  });

/** One send span for the whole call; every message carries its traceparent. */
function traceSend(tracer: Tracer, topics: TopicMessages[], send: (next: TopicMessages[]) => unknown): unknown {
  const batchSize = topics.reduce((t, x) => t + x.messages.length, 0);
  const open = startProducer(tracer, { system: "kafka", destination: [...new Set(topics.map((t) => t.topic))].join(", "), batchSize });
  if (!open) return send(topics);
  const next = topics.map((t) => ({ ...t, messages: withHeaders(t.messages, (h) => injectInto(open.ctx, h)) }));
  return runInSpan(open.span, open.ctx, () => send(next));
}

function patchProducer(producer: object, tracer: Tracer): void {
  patchMethod(producer, "send", (original) =>
    function (this: unknown, record: unknown) {
      const r = record as TopicMessages;
      return traceSend(tracer, [r], ([next]) => original.call(this, { ...r, ...next }));
    },
  );
  patchMethod(producer, "sendBatch", (original) =>
    function (this: unknown, batch: unknown) {
      const b = batch as { topicMessages?: TopicMessages[] };
      return traceSend(tracer, b.topicMessages ?? [], (next) => original.call(this, { ...b, topicMessages: next }));
    },
  );
}

function traceHandlers(config: RunConfig, tracer: Tracer): RunConfig {
  const out = { ...config };
  const { eachMessage, eachBatch } = config;
  if (eachMessage) {
    out.eachMessage = (p) => {
      const { span, ctx } = startConsumer(tracer, { system: "kafka", destination: p.topic, messageId: p.message.offset }, p.message.headers);
      return runInSpan(span, ctx, () => eachMessage(p));
    };
  }
  if (eachBatch) {
    out.eachBatch = (p) => {
      const facts = { system: "kafka" as const, destination: p.batch.topic, batchSize: p.batch.messages.length };
      const { span, ctx } = startConsumer(tracer, facts, p.batch.messages[0]?.headers);
      return runInSpan(span, ctx, () => eachBatch(p));
    };
  }
  return out;
}

function patchConsumer(consumer: object, tracer: Tracer): void {
  patchMethod(consumer, "run", (original) =>
    function (this: unknown, config: unknown) {
      return original.call(this, config && typeof config === "object" ? traceHandlers(config as RunConfig, tracer) : config);
    },
  );
}

/** Patch the producers and consumers a Kafka instance (or the Kafka class) makes. */
function patchFactory(target: object, tracer: Tracer): void {
  for (const [name, patch] of [["producer", patchProducer], ["consumer", patchConsumer]] as const) {
    patchMethod(target, name, (original) =>
      function (this: unknown, ...args: unknown[]) {
        const made = original.apply(this, args);
        if (made && typeof made === "object") patch(made, tracer);
        return made;
      },
    );
  }
}

/** Trace Kafka through kafkajs. Pass the module, a Kafka instance, a producer, or a consumer. Returns false when nothing was patched. */
export function instrumentKafkaJs(wizelens: WizeLens, target: unknown): boolean {
  const t = target as Record<string, unknown> | null;
  if (!captureOf(wizelens) || !t || typeof t !== "object") return false;
  const tracer = wizelens.tracer;
  const Kafka = t.Kafka as { prototype?: object } | undefined;
  if (Kafka?.prototype) return (patchFactory(Kafka.prototype, tracer), true);
  if (typeof t.producer === "function" && typeof t.consumer === "function") return (patchFactory(t, tracer), true);
  if (typeof t.sendBatch === "function") return (patchProducer(t, tracer), true);
  if (typeof t.run === "function" && typeof t.subscribe === "function") return (patchConsumer(t, tracer), true);
  return false;
}
