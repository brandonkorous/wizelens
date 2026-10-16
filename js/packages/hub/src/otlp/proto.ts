import protobuf from "protobufjs";
import type { OtlpResourceLogs } from "./logs.js";
import type { OtlpResourceSpans } from "./spans.js";

// The parts of opentelemetry-proto (common, resource, trace, logs) the hub reads. Enums are read as int32.
type Fields = Record<string, [type: string, id: number, rule?: "repeated"]>;
const msg = (fields: Fields, oneof?: string[]) => ({
  fields: Object.fromEntries(Object.entries(fields).map(([k, [type, id, rule]]) => [k, rule ? { type, id, rule } : { type, id }])),
  ...(oneof ? { oneofs: { value: { oneof } } } : {}),
});

const VALUE_FIELDS = ["stringValue", "boolValue", "intValue", "doubleValue", "arrayValue", "kvlistValue", "bytesValue"];

const DESCRIPTOR = {
  nested: {
    AnyValue: msg(
      {
        stringValue: ["string", 1],
        boolValue: ["bool", 2],
        intValue: ["int64", 3],
        doubleValue: ["double", 4],
        arrayValue: ["ArrayValue", 5],
        kvlistValue: ["KeyValueList", 6],
        bytesValue: ["bytes", 7],
      },
      VALUE_FIELDS,
    ),
    ArrayValue: msg({ values: ["AnyValue", 1, "repeated"] }),
    KeyValueList: msg({ values: ["KeyValue", 1, "repeated"] }),
    KeyValue: msg({ key: ["string", 1], value: ["AnyValue", 2] }),
    Scope: msg({ name: ["string", 1], version: ["string", 2] }),
    Resource: msg({ attributes: ["KeyValue", 1, "repeated"] }),
    Event: msg({ timeUnixNano: ["fixed64", 1], name: ["string", 2], attributes: ["KeyValue", 3, "repeated"] }),
    Status: msg({ message: ["string", 2], code: ["int32", 3] }),
    Span: msg({
      traceId: ["bytes", 1],
      spanId: ["bytes", 2],
      parentSpanId: ["bytes", 4],
      name: ["string", 5],
      kind: ["int32", 6],
      startTimeUnixNano: ["fixed64", 7],
      endTimeUnixNano: ["fixed64", 8],
      attributes: ["KeyValue", 9, "repeated"],
      events: ["Event", 11, "repeated"],
      status: ["Status", 15],
    }),
    ScopeSpans: msg({ scope: ["Scope", 1], spans: ["Span", 2, "repeated"] }),
    ResourceSpans: msg({ resource: ["Resource", 1], scopeSpans: ["ScopeSpans", 2, "repeated"] }),
    ExportTraceServiceRequest: msg({ resourceSpans: ["ResourceSpans", 1, "repeated"] }),
    LogRecord: msg({
      timeUnixNano: ["fixed64", 1],
      severityNumber: ["int32", 2],
      severityText: ["string", 3],
      body: ["AnyValue", 5],
      attributes: ["KeyValue", 6, "repeated"],
      traceId: ["bytes", 9],
      spanId: ["bytes", 10],
      observedTimeUnixNano: ["fixed64", 11],
    }),
    ScopeLogs: msg({ scope: ["Scope", 1], logRecords: ["LogRecord", 2, "repeated"] }),
    ResourceLogs: msg({ resource: ["Resource", 1], scopeLogs: ["ScopeLogs", 2, "repeated"] }),
    ExportLogsServiceRequest: msg({ resourceLogs: ["ResourceLogs", 1, "repeated"] }),
  },
};

const root = protobuf.Root.fromJSON(DESCRIPTOR);
const TO_OBJECT = { longs: String, bytes: String, defaults: false, oneofs: false } as const;
const ID_KEYS = new Set(["traceId", "spanId", "parentSpanId"]);

/** protobufjs gives bytes as base64. OTLP/JSON uses hex for ids, so convert them the same way. */
function hexIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hexIds);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = ID_KEYS.has(k) && typeof v === "string" ? Buffer.from(v, "base64").toString("hex") : hexIds(v);
  return out;
}

function decode(type: string, body: Uint8Array): Record<string, unknown> {
  const t = root.lookupType(type);
  return hexIds(t.toObject(t.decode(body), TO_OBJECT)) as Record<string, unknown>;
}

export const decodeTraces = (body: Uint8Array): OtlpResourceSpans[] =>
  (decode("ExportTraceServiceRequest", body).resourceSpans as OtlpResourceSpans[] | undefined) ?? [];

export const decodeLogs = (body: Uint8Array): OtlpResourceLogs[] =>
  (decode("ExportLogsServiceRequest", body).resourceLogs as OtlpResourceLogs[] | undefined) ?? [];

/** Encode a request, for tests and for tools that send protobuf. */
export function encodeTraces(request: { resourceSpans: unknown[] }): Uint8Array {
  const t = root.lookupType("ExportTraceServiceRequest");
  return t.encode(t.fromObject(request)).finish();
}
