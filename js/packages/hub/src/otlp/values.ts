import type { AttributeValue, Attributes } from "@wizeworks/lens-core";

/** OTLP shapes after JSON parse or protobuf decode. Ids are hex, 64-bit numbers are strings or numbers. */
export interface OtlpAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: { values?: OtlpAnyValue[] };
  kvlistValue?: { values?: OtlpKeyValue[] };
  bytesValue?: string;
}

export interface OtlpKeyValue {
  key: string;
  value?: OtlpAnyValue;
}

export interface OtlpResource {
  attributes?: OtlpKeyValue[];
}

/** One AnyValue as a contract attribute value. Arrays and maps become JSON text. */
export function valueOf(v: OtlpAnyValue | undefined): AttributeValue {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.arrayValue) return JSON.stringify((v.arrayValue.values ?? []).map(valueOf));
  if (v.kvlistValue) return JSON.stringify(attributesOf(v.kvlistValue.values));
  if (v.bytesValue !== undefined) return v.bytesValue;
  return null;
}

// Older semantic-convention names, mapped to the ones the dashboard reads.
const ALIASES: Record<string, string> = {
  "http.method": "http.request.method",
  "http.status_code": "http.response.status_code",
  "http.url": "url.full",
  "http.target": "url.path",
  "http.scheme": "url.scheme",
  "db.statement": "db.query.text",
  "db.system": "db.system.name",
  "db.name": "db.namespace",
  "db.operation": "db.operation.name",
  "net.peer.name": "server.address",
  "net.peer.port": "server.port",
  "deployment.environment": "deployment.environment.name",
};

/** Key-value list as contract attributes, with older names copied to the current ones. */
export function attributesOf(list: OtlpKeyValue[] | undefined): Attributes {
  const out: Attributes = {};
  for (const kv of list ?? []) if (kv?.key) out[kv.key] = valueOf(kv.value);
  for (const [old, current] of Object.entries(ALIASES)) {
    if (out[old] !== undefined && out[current] === undefined) out[current] = out[old]!;
  }
  return out;
}

/** Unix nanoseconds (string or number) as epoch ms. */
export function nanosToMs(v: string | number | undefined): number {
  if (v === undefined || v === "") return 0;
  if (typeof v === "number") return v / 1e6;
  const n = BigInt(v);
  return Number(n / 1000n) / 1000;
}

/** A 16- or 32-hex id, or undefined for an empty or all-zero id. */
export function hexId(v: string | undefined, length: 16 | 32): string | undefined {
  const id = v?.toLowerCase();
  if (!id || id.length !== length || !/^[0-9a-f]+$/.test(id) || /^0+$/.test(id)) return undefined;
  return id;
}

/** The sender a resource describes. */
export function senderOf(resource: OtlpResource | undefined) {
  const a = attributesOf(resource?.attributes);
  const str = (k: string) => (typeof a[k] === "string" && a[k] ? String(a[k]).slice(0, 100) : undefined);
  const lang = str("telemetry.sdk.language");
  return {
    service: str("service.name") ?? "unknown_service",
    project: str("wizelens.project") ?? str("service.namespace"),
    version: str("service.version"),
    runtime: lang ? `otlp ${lang}` : "otlp",
    environment: str("deployment.environment.name"),
    host: str("host.name"),
  };
}
