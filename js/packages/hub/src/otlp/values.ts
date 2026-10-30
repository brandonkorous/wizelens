import { type AttributeValue, type Attributes, type HubSender, INFRA_SERVICE } from "@wizeworks/lens-core/internal";
import { applyAliases, headerKey, headerValue, isHeaderKey } from "./semconv.js";

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

/** Key-value list as contract attributes, with older names copied to the current ones. */
export function attributesOf(list: OtlpKeyValue[] | undefined): Attributes {
  const out: Attributes = {};
  for (const kv of list ?? []) {
    if (!kv?.key) continue;
    if (isHeaderKey(kv.key)) out[headerKey(kv.key)] = headerValue(kv.value, valueOf);
    else out[kv.key] = valueOf(kv.value);
  }
  return applyAliases(out);
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

/** The resource attributes of `keys` that it has, to copy onto points or spans. */
export function resourcePick(resource: OtlpResource | undefined, keys: readonly string[]): Attributes {
  const a = attributesOf(resource?.attributes);
  const out: Attributes = {};
  for (const k of keys) if (a[k] !== undefined && a[k] !== null && a[k] !== "") out[k] = a[k]!;
  return out;
}

/** Where a resource runs in Kubernetes; undefined when it has no k8s attributes. */
function k8sOf(str: (k: string) => string | undefined): HubSender["k8s"] {
  const all = { cluster: str("k8s.cluster.name"), namespace: str("k8s.namespace.name"), pod: str("k8s.pod.name"), node: str("k8s.node.name") };
  const k8s = Object.fromEntries(Object.entries(all).filter(([, v]) => v));
  return Object.keys(k8s).length > 0 ? k8s : undefined;
}

/** The sender a resource describes. The collector's host and Kubernetes receivers send no service name: they are "infrastructure". */
export function senderOf(resource: OtlpResource | undefined): HubSender {
  const a = attributesOf(resource?.attributes);
  const str = (k: string) => (typeof a[k] === "string" && a[k] ? String(a[k]).slice(0, 100) : undefined);
  const lang = str("telemetry.sdk.language");
  const k8s = k8sOf(str);
  const infra = !!(str("host.name") || k8s);
  return {
    service: str("service.name") ?? (infra ? INFRA_SERVICE : "unknown_service"),
    project: str("wizelens.project") ?? str("service.namespace"),
    version: str("service.version"),
    release: str("service.version"),
    runtime: lang ? `otlp ${lang}` : "otlp",
    environment: str("deployment.environment.name"),
    // A pod's host name is the pod's name; senders without host.name (most SDKs) still get one row per pod.
    host: str("host.name") ?? k8s?.pod,
    ...(k8s ? { k8s } : {}),
  };
}
