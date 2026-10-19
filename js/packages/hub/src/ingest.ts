import {
  type Attributes,
  type HubLog,
  type HubRemote,
  type HubSender,
  type LogLevel,
  type LogRecord,
  redactAttributes,
  sanitizeMetricPoint,
  stampVersion,
  toAttributeValue,
} from "@wizeworks/lens-core";
import { sanitizeClientSpan } from "@wizeworks/lens-node/kit";
import type { HubWrite } from "./store.js";

const MAX_ITEMS = 5000;
const HEX32 = /^[0-9a-f]{32}$/;
const HEX16 = /^[0-9a-f]{16}$/;
const LEVELS: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error", "critical"];

const text = (v: unknown, max: number): string | undefined => (typeof v === "string" && v ? v.slice(0, max) : undefined);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
const isUrl = (v: unknown): v is string => typeof v === "string" && v.length <= 500 && /^https?:\/\/[^\s]+$/i.test(v);

/** The sender block of a batch. Null without a service name. */
export function parseSender(raw: unknown): HubSender | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const service = text(s.service, 100);
  if (!service) return null;
  return {
    service,
    project: text(s.project, 100),
    version: text(s.version, 50),
    release: text(s.release, 50),
    runtime: text(s.runtime, 100),
    environment: text(s.environment, 50),
    host: text(s.host, 100),
    endpoint: isUrl(s.endpoint) ? s.endpoint.replace(/\/+$/, "") : undefined,
    startedMs: Number.isFinite(s.startedMs) ? Number(s.startedMs) : undefined,
  };
}

function toAttributes(raw: unknown, redactKeys: readonly string[]): Attributes {
  const out: Attributes = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) out[k] = toAttributeValue(v);
  return redactAttributes(out, redactKeys);
}

/** One log line from a batch. Null when it is not valid. */
export function parseLog(raw: unknown, service: string, redactKeys: readonly string[]): HubLog | null {
  if (!raw || typeof raw !== "object") return null;
  const { traceId, log } = raw as { traceId?: unknown; log?: Record<string, unknown> };
  if (typeof traceId !== "string" || !HEX32.test(traceId) || !log || typeof log !== "object") return null;
  const record: LogRecord = {
    timeMs: Number(log.timeMs) || 0,
    level: LEVELS.includes(log.level as LogLevel) ? (log.level as LogLevel) : "info",
    category: text(log.category, 200) ?? "app",
    message: typeof log.message === "string" ? log.message.slice(0, 10_000) : "",
    service: text(log.service, 100) ?? service,
    spanId: typeof log.spanId === "string" && HEX16.test(log.spanId) ? log.spanId : null,
    attributes: toAttributes(log.attributes, redactKeys),
  };
  return { traceId, log: record };
}

function parseRemote(raw: unknown): HubRemote | null {
  const r = raw as { traceId?: unknown; endpoint?: unknown } | null;
  if (!r || typeof r.traceId !== "string" || !HEX32.test(r.traceId) || !isUrl(r.endpoint)) return null;
  return { traceId: r.traceId, endpoint: r.endpoint.replace(/\/+$/, "") };
}

const notNull = <T>(v: T | null): v is T => v !== null;

/** Check and redact one `api/ingest` body. Null when the sender is missing. */
export function parseIngest(raw: unknown, redactKeys: readonly string[]): HubWrite | null {
  const body = raw as Record<string, unknown> | null;
  const sender = parseSender(body?.sender);
  if (!body || !sender) return null;
  const spans = stampVersion(
    list(body.spans)
      .map((s) => sanitizeClientSpan(s, redactKeys))
      .filter(notNull),
    sender,
  );
  return {
    sender,
    via: "addon",
    spans,
    logs: list(body.logs)
      .map((l) => parseLog(l, sender.service, redactKeys))
      .filter(notNull),
    remotes: list(body.remotes).map(parseRemote).filter(notNull),
    metrics: list(body.metrics)
      .map((p) => sanitizeMetricPoint(p, redactKeys, sender.service))
      .filter(notNull),
  };
}
