// Collector metric points for infrastructure tests: two hosts (hostmetrics), a Kubernetes cluster (kubeletstats, k8s_cluster), and a registry.
import type { HubService } from "../hub.js";
import { hostsModelOf } from "../infra/hosts.js";
import { kubeModelOf } from "../infra/kube.js";
import { INFRA_SERVICE } from "../infra/names.js";
import type { MetricData } from "../metrics/from-rollups.js";
import type { MetricPoint } from "../metrics/types.js";
import { TIME_RANGES, type TimeRange } from "../stats/common.js";
import type { Attributes } from "../types.js";
import { METRIC_NOW } from "./metric-scenario.js";

type Make = (i: number, t: number) => Omit<MetricPoint, "timeMs" | "service"> | null;

const wave = (i: number, salt: number) => 0.5 + 0.4 * Math.sin(i / 7 + salt);
const gauge = (name: string, unit: string, attributes: Attributes, f: (i: number) => number): Make => (i) => ({ name, kind: "gauge", unit, attributes, value: f(i) });
const upDown = (name: string, unit: string, attributes: Attributes, f: (i: number) => number): Make => (i) => ({ name, kind: "sum", unit, attributes, monotonic: false, temporality: "cumulative", value: f(i) });

/** A cumulative counter growing by `step(i)`. */
function counter(name: string, unit: string, attributes: Attributes, step: (i: number) => number): Make {
  let total = 0;
  return (i) => ((total += step(i)), { name, kind: "sum", unit, attributes, monotonic: true, temporality: "cumulative", value: total });
}

function hostMakers(host: string, utilization: boolean): Make[] {
  const h = { "host.name": host, "os.type": "linux" };
  const cpus = ["cpu0", "cpu1"].flatMap((cpu, c) =>
    ["user", "system", "idle"].map((state) => {
      const share = (i: number) => (state === "idle" ? 1 - 0.6 * wave(i, c) : (0.6 * wave(i, c)) / 2);
      return utilization ? gauge("system.cpu.utilization", "1", { ...h, cpu, state }, share) : counter("system.cpu.time", "s", { ...h, cpu, state }, (i) => 10 * share(i));
    }),
  );
  const mem = ["used", "free", "cached", "slab_reclaimable"].map((state, k) => upDown("system.memory.usage", "By", { ...h, state }, (i) => (k === 0 ? 4e9 * wave(i, 2) : 1e9 * (k + 1))));
  const fs = ["used", "free", "reserved"].map((state, k) => upDown("system.filesystem.usage", "By", { ...h, device: "/dev/sda1", mountpoint: "/", type: "ext4", mode: "rw", state }, () => [6e10, 3e10, 1e9][k]!));
  const io = (name: string, dir: string, dev: string, salt: number) => counter(name, "By", { ...h, device: dev, direction: dir }, (i) => Math.round(1e6 * wave(i, salt)));
  return [
    ...cpus,
    ...mem,
    ...fs,
    gauge("system.cpu.load_average.1m", "{thread}", h, (i) => 2 * wave(i, 5)),
    io("system.disk.io", "read", "sda", 1),
    io("system.disk.io", "write", "sda", 2),
    io("system.network.io", "receive", "eth0", 3),
    io("system.network.io", "transmit", "eth0", 4),
    io("system.network.io", "receive", "lo", 5),
  ];
}

const CLUSTER = { "k8s.cluster.name": "prod" };

function podMakers(ns: string, pod: string, node: string, workload: Attributes, phase: (i: number) => number, oomAt: number): Make[] {
  const p = { ...CLUSTER, "k8s.namespace.name": ns, "k8s.pod.name": pod, "k8s.node.name": node, ...workload };
  const c = { ...p, "k8s.container.name": "app" };
  const restarts: Make = (i) => {
    const after = oomAt >= 0 && i >= oomAt;
    const attributes = after ? { ...c, "k8s.container.status.last_terminated_reason": "OOMKilled" } : c;
    return { name: "k8s.container.restarts", kind: "gauge", unit: "{restart}", attributes, value: after ? 2 : 1 };
  };
  return [
    gauge("k8s.pod.phase", "", p, phase),
    gauge("k8s.pod.cpu.usage", "{cpu}", p, (i) => 0.3 * wave(i, 1)),
    gauge("k8s.pod.memory.working_set", "By", p, (i) => 2e8 * wave(i, 2)),
    counter("k8s.pod.network.io", "By", { ...p, interface: "eth0", direction: "receive" }, (i) => Math.round(5e4 * wave(i, 3))),
    counter("k8s.pod.network.io", "By", { ...p, interface: "eth0", direction: "transmit" }, (i) => Math.round(3e4 * wave(i, 4))),
    restarts,
    gauge("k8s.container.ready", "", c, () => 1),
    gauge("k8s.container.memory_limit", "By", c, () => 5e8),
  ];
}

function kubeMakers(): Make[] {
  const node = (name: string) => [
    gauge("k8s.node.cpu.usage", "{cpu}", { ...CLUSTER, "k8s.node.name": name }, (i) => 1.2 * wave(i, 6)),
    gauge("k8s.node.memory.working_set", "By", { ...CLUSTER, "k8s.node.name": name }, (i) => 3e9 * wave(i, 7)),
    gauge("k8s.node.condition_ready", "", { ...CLUSTER, "k8s.node.name": name }, () => 1),
    gauge("k8s.node.allocatable_cpu", "{cpu}", { ...CLUSTER, "k8s.node.name": name }, () => 2),
  ];
  const deploy = { "k8s.deployment.name": "api" };
  const ns = { ...CLUSTER, "k8s.namespace.name": "shop" };
  return [
    ...node("node-a"),
    ...node("node-b"),
    ...podMakers("shop", "api-7d9f-abc", "node-a", deploy, () => 2, 60),
    ...podMakers("shop", "api-7d9f-def", "node-b", deploy, () => 2, -1),
    ...podMakers("shop", "db-0", "node-b", { "k8s.statefulset.name": "db" }, () => 2, -1),
    ...podMakers("shop", "worker-5c4-xyz", "", { "k8s.deployment.name": "worker" }, (i) => (i < 40 ? 2 : 1), -1),
    ...podMakers("shop", "api-7d9f-old", "node-a", deploy, () => 2, -1).map((make): Make => (i, t) => (i < 60 ? make(i, t) : null)),
    gauge("k8s.deployment.desired", "{pod}", { ...ns, ...deploy }, () => 2),
    gauge("k8s.deployment.available", "{pod}", { ...ns, ...deploy }, () => 2),
    gauge("k8s.deployment.desired", "{pod}", { ...ns, "k8s.deployment.name": "worker" }, () => 1),
    gauge("k8s.deployment.available", "{pod}", { ...ns, "k8s.deployment.name": "worker" }, () => 0),
    gauge("k8s.statefulset.desired_pods", "{pod}", { ...ns, "k8s.statefulset.name": "db" }, () => 1),
    gauge("k8s.statefulset.ready_pods", "{pod}", { ...ns, "k8s.statefulset.name": "db" }, () => 1),
  ];
}

/** About 150 points per series over the range's window (plus `before` steps ahead of it), 3 s into a 10 s bucket. */
export function infraScenario(range: TimeRange, now = METRIC_NOW, before = 0): MetricPoint[] {
  const ms = TIME_RANGES[range].ms;
  const step = Math.max(10_000, Math.round(ms / 150 / 10_000) * 10_000);
  const list = [...hostMakers("node-a", true), ...hostMakers("node-b", false), ...kubeMakers()];
  const out: MetricPoint[] = [];
  for (let i = 0, t = now - ms - before * step + 3_000; t < now; i++, t += step) {
    for (const make of list) {
      const p = make(i, t);
      if (p) out.push({ ...p, service: INFRA_SERVICE, timeMs: t });
    }
  }
  return out;
}

const svc = (service: string, host: string, extra: Partial<HubService> = {}): HubService => ({ service, host, environment: "prod", via: "otlp", firstSeenMs: METRIC_NOW - 3_600_000, lastSeenMs: METRIC_NOW, online: true, ...extra });

/** Services on those hosts: one by pod host name, one by its Kubernetes resource, one on a plain host. */
export const INFRA_REGISTRY: HubService[] = [
  svc("api", "api-7d9f-abc"),
  svc("api", "api-7d9f-def"),
  svc("orders", "", { k8s: { namespace: "shop", pod: "db-0", node: "node-b" } }),
  svc("billing", "node-a"),
];

/** Param sets the parity tests run on every host: lists, each kind of selection, and the filters. */
export const INFRA_PARAM_SETS: Record<string, string>[] = [
  {},
  { host: "node-a" },
  { host: "node-b", q: "node" },
  { node: "node-b" },
  { pod: "shop/api-7d9f-abc" },
  { pod: "shop/worker-5c4-xyz", ns: "shop" },
  { cluster: "prod", workload: "shop/Deployment/api" },
  { service: "orders", q: "db" },
];

/** Both infrastructure pages from one data set, for comparing hosts. */
export const infraModels = (d: MetricData) => ({ hosts: hostsModelOf(d, INFRA_REGISTRY), kube: kubeModelOf(d, INFRA_REGISTRY) });
