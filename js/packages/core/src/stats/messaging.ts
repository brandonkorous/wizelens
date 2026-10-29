import { ATTR_MESSAGING } from "../attributes.js";
import type { Span } from "../types.js";

const str = (s: Span, k: string): string | null => (s.attributes[k] == null || s.attributes[k] === "" ? null : String(s.attributes[k]));

export const isProducer = (s: Span): boolean => s.category === "messaging" && s.kind === "producer";

export const isConsumer = (s: Span): boolean => s.category === "messaging" && s.kind === "consumer";

/** Queue key and label: "rabbitmq · orders". */
export function queueOf(s: Span): string {
  const system = str(s, ATTR_MESSAGING.system) ?? "queue";
  const destination = str(s, ATTR_MESSAGING.destination) ?? "unknown";
  return `${system} · ${destination}`;
}

/** Messaging spans of a trace as a table for the trace page: who sent or handled what, where. */
export interface MessageRow {
  spanId: string;
  service: string;
  operation: string;
  queue: string;
  /** What was sent, when the system names it: a RabbitMQ routing key such as OrderStartedIntegrationEvent. */
  message: string | null;
  messageId: string | null;
  durationMs: number;
  startMs: number;
  error: boolean;
}

export function messageRows(spans: readonly Span[]): MessageRow[] {
  return spans
    .filter((s) => s.category === "messaging")
    .map((s) => ({
      spanId: s.spanId,
      service: s.service,
      operation: str(s, ATTR_MESSAGING.operation) ?? (s.kind === "producer" ? "send" : "process"),
      queue: queueOf(s),
      message: str(s, ATTR_MESSAGING.routingKey),
      messageId: str(s, ATTR_MESSAGING.messageId),
      durationMs: s.durationMs,
      startMs: s.startMs,
      error: s.status === "error",
    }))
    .sort((a, b) => a.startMs - b.startMs);
}
