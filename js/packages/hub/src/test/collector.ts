// OpenTelemetry Collector exports for tests: two recorded hostmetrics exports, and kubeletstats and k8s_cluster exports in the receivers' shapes.
import { readFileSync } from "node:fs";

type Kv = { key: string; value: { stringValue: string } };
type Json = Record<string, unknown>;

const kv = (o: Record<string, string>): Kv[] => Object.entries(o).map(([key, v]) => ({ key, value: { stringValue: v } }));
const nanos = (ms: number) => String(BigInt(Math.round(ms)) * 1_000_000n);

/** Every time field in an export moved by `shiftMs`. */
function shifted(v: unknown, shiftMs: number): unknown {
  if (Array.isArray(v)) return v.map((x) => shifted(x, shiftMs));
  if (!v || typeof v !== "object") return v;
  const out: Json = {};
  for (const [k, x] of Object.entries(v as Json)) out[k] = k.endsWith("UnixNano") && x !== "0" ? String(BigInt(String(x)) + BigInt(shiftMs) * 1_000_000n) : shifted(x, shiftMs);
  return out;
}

/** The two recorded hostmetrics exports (host "docker-host", 20 s apart), the newer one ending at `nowMs`. */
export function hostmetricsExports(nowMs: number): Json[] {
  const raw = JSON.parse(readFileSync(new URL("./collector-hostmetrics.json", import.meta.url), "utf8")) as Json[];
  let newest = 0n;
  JSON.stringify(raw, (k, x) => (k === "timeUnixNano" && BigInt(x) > newest ? (newest = BigInt(x)) : 0, x));
  return shifted(raw, nowMs - Number(newest / 1_000_000n)) as Json[];
}

const gauge = (name: string, unit: string, value: number, t: number) => ({ name, unit, gauge: { dataPoints: [{ timeUnixNano: nanos(t), asDouble: value }] } });
const intGauge = (name: string, value: number, t: number) => ({ name, unit: "1", gauge: { dataPoints: [{ timeUnixNano: nanos(t), asInt: String(value) }] } });
const counter = (name: string, value: number, t: number, attrs: Record<string, string>) => ({
  name,
  unit: "By",
  sum: { aggregationTemporality: 2, isMonotonic: true, dataPoints: [{ timeUnixNano: nanos(t), startTimeUnixNano: nanos(t - 3_600_000), asInt: String(value), attributes: kv(attrs) }] },
});
const resource = (attrs: Record<string, string>, metrics: unknown[]) => ({ resource: { attributes: kv(attrs) }, scopeMetrics: [{ scope: { name: "otelcol/k8s" }, metrics }] });

const POD = { "k8s.cluster.name": "kind", "k8s.namespace.name": "shop", "k8s.pod.name": "api-6d8f9-x2x8z", "k8s.pod.uid": "3f2a", "k8s.node.name": "kind-worker", "k8s.deployment.name": "api" };

/** One kubeletstats and one k8s_cluster export at time `t`; `bytes` grows the counters between exports. */
export function kubeExport(t: number, bytes: number): Json {
  const node = { "k8s.cluster.name": "kind", "k8s.node.name": "kind-worker" };
  const container = { ...POD, "k8s.container.name": "api", "container.id": "c0ffee", "k8s.container.status.last_terminated_reason": "OOMKilled" };
  return {
    resourceMetrics: [
      resource(node, [gauge("k8s.node.cpu.usage", "{cpu}", 0.42, t), gauge("k8s.node.memory.working_set", "By", 2.1e9, t), counter("k8s.node.network.io", bytes * 4, t, { interface: "eth0", direction: "receive" })]),
      resource(POD, [gauge("k8s.pod.cpu.usage", "{cpu}", 0.12, t), gauge("k8s.pod.memory.working_set", "By", 1.5e8, t), counter("k8s.pod.network.io", bytes, t, { interface: "eth0", direction: "receive" })]),
      resource({ "k8s.cluster.name": "kind", "k8s.namespace.name": "shop", "k8s.pod.name": "api-6d8f9-pending", "k8s.deployment.name": "api" }, [intGauge("k8s.pod.phase", 1, t)]),
      resource(POD, [intGauge("k8s.pod.phase", 2, t)]),
      resource(container, [intGauge("k8s.container.restarts", 3, t), intGauge("k8s.container.ready", 1, t), gauge("k8s.container.memory_limit", "By", 2.68e8, t)]),
      resource({ "k8s.cluster.name": "kind", "k8s.namespace.name": "shop", "k8s.deployment.name": "api" }, [intGauge("k8s.deployment.desired", 2, t), intGauge("k8s.deployment.available", 1, t)]),
      resource(node, [intGauge("k8s.node.condition_ready", 1, t)]),
    ],
  };
}

/** A span from an app in that pod, through the collector's k8sattributes processor. */
export function podSpanExport(t: number, traceId: string): Json {
  const attrs = { "service.name": "api", "host.name": "api-6d8f9-x2x8z", ...POD };
  const span = { traceId, spanId: "b7ad6b7169203331", name: "GET /orders", kind: 2, startTimeUnixNano: nanos(t - 20), endTimeUnixNano: nanos(t), attributes: kv({ "http.request.method": "GET", "url.path": "/orders" }) };
  return { resourceSpans: [{ resource: { attributes: kv(attrs) }, scopeSpans: [{ spans: [span] }] }] };
}
