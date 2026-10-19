import { type Attributes, isDbCall, redactAttributes, SPAN_RESOURCE_KEYS, type Span, stampVersion, type SpanCategory, type SpanKind } from "@wizeworks/lens-core";
import type { HubWrite } from "../store.js";
import { attributesOf, hexId, nanosToMs, type OtlpKeyValue, type OtlpResource, resourcePick, senderOf } from "./values.js";

export interface OtlpSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: number | string;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: OtlpKeyValue[];
  events?: { timeUnixNano?: string | number; name?: string; attributes?: OtlpKeyValue[] }[];
  status?: { code?: number | string; message?: string };
}

export interface OtlpResourceSpans {
  resource?: OtlpResource;
  scopeSpans?: { spans?: OtlpSpan[] }[];
}

const KINDS: SpanKind[] = ["internal", "internal", "server", "client", "producer", "consumer"];
const KIND_NAMES: Record<string, SpanKind> = {
  SPAN_KIND_SERVER: "server",
  SPAN_KIND_CLIENT: "client",
  SPAN_KIND_PRODUCER: "producer",
  SPAN_KIND_CONSUMER: "consumer",
};

const kindOf = (k: number | string | undefined): SpanKind => (typeof k === "string" ? (KIND_NAMES[k] ?? "internal") : (KINDS[k ?? 0] ?? "internal"));

function statusOf(code: number | string | undefined): Span["status"] {
  if (code === 2 || code === "STATUS_CODE_ERROR") return "error";
  if (code === 1 || code === "STATUS_CODE_OK") return "ok";
  return "unset";
}

/** The same rules the add-ons use (lens-node processor.ts). */
function categoryOf(kind: SpanKind, a: Attributes): SpanCategory {
  if (a["messaging.system"] != null) return "messaging";
  if (isDbCall(a)) return "db";
  const web = a["http.request.method"] != null || a["rpc.system"] != null;
  if (kind === "server" && web) return "http.server";
  if (kind === "client" && web) return "http.client";
  return "internal";
}

function clientName(a: Attributes, fallback: string): string {
  try {
    const u = new URL(String(a["url.full"]));
    return `${String(a["http.request.method"] ?? "GET")} ${u.host}${u.pathname}`;
  } catch {
    return fallback;
  }
}

/** One OTLP span as a contract span, with the resource's Kubernetes attributes (`resource`) under its own. Null when its ids are not valid. */
export function toSpan(s: OtlpSpan, service: string, redactKeys: readonly string[], resource: Attributes = {}): Span | null {
  const traceId = hexId(s.traceId, 32);
  const spanId = hexId(s.spanId, 16);
  if (!traceId || !spanId) return null;
  const kind = kindOf(s.kind);
  const attributes = redactAttributes({ ...resource, ...attributesOf(s.attributes) }, redactKeys);
  const category = categoryOf(kind, attributes);
  const startMs = nanosToMs(s.startTimeUnixNano);
  const name = String(s.name ?? "span").slice(0, 500);
  return {
    traceId,
    spanId,
    parentSpanId: hexId(s.parentSpanId, 16) ?? null,
    name: category === "http.client" && attributes["url.full"] ? clientName(attributes, name) : name,
    kind,
    category,
    service,
    startMs,
    durationMs: Math.max(0, nanosToMs(s.endTimeUnixNano) - startMs),
    status: statusOf(s.status?.code),
    statusMessage: s.status?.message || null,
    attributes,
    events: (s.events ?? []).slice(0, 50).map((e) => ({
      name: String(e.name ?? "event"),
      timeMs: nanosToMs(e.timeUnixNano),
      attributes: redactAttributes(attributesOf(e.attributes), redactKeys),
    })),
  };
}

/** One write per resource: each resource is one sender. */
export function writesFromSpans(list: readonly OtlpResourceSpans[], redactKeys: readonly string[]): HubWrite[] {
  return list.map((rs) => {
    const sender = senderOf(rs.resource);
    const spans = (rs.scopeSpans ?? []).flatMap((ss) => ss.spans ?? []);
    const resource = resourcePick(rs.resource, SPAN_RESOURCE_KEYS);
    const mapped = spans.map((s) => toSpan(s, sender.service, redactKeys, resource)).filter((s): s is Span => s !== null);
    // The resource's service.version goes on the sender's spans, for releases and so Problems can tell a new one.
    return { sender, via: "otlp" as const, spans: stampVersion(mapped, sender), logs: [], remotes: [] };
  });
}
