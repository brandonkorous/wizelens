// Kubernetes nodes and workloads: kubelet usage and k8s_cluster state, with the pods that belong to each.
import { KUBE } from "./names.js";
import { isLive, type PodRow } from "./kube-pods.js";
import { attrOf, groupBy, lastOf, named, type Series, seenOf, sumOf } from "./series.js";

export interface NodeRow {
  name: string;
  cluster: string;
  /** The Ready condition; null when k8s_cluster does not report it. */
  ready: boolean | null;
  cpu: number | null;
  cpuAlloc: number | null;
  memory: number | null;
  memAlloc: number | null;
  pods: number;
  pending: number;
  restartsNew: number;
  /** The Hosts page has a host of this name (hostmetrics on the node). */
  host: boolean;
  lastSeenMs: number;
}

export interface WorkloadRow {
  /** "namespace/Kind/name". */
  key: string;
  namespace: string;
  kind: string;
  name: string;
  desired: number | null;
  ready: number | null;
  pods: number;
  pending: number;
  restartsNew: number;
  oomKills: number;
}

const newestValue = (list: readonly Series[]) => (list.length ? lastOf(list.reduce((a, b) => (b.total.lastMs > a.total.lastMs ? b : a))) : null);
const isNodeSeries = (s: Series) => s.name.startsWith("k8s.node.");

/** Node series by node name. */
export const nodeSeries = (series: readonly Series[]): Map<string, Series[]> => groupBy(series.filter(isNodeSeries), (s) => attrOf(s, "k8s.node.name"));

function nodeOf(name: string, list: readonly Series[], pods: readonly PodRow[], hosts: ReadonlySet<string>): NodeRow {
  const ready = newestValue(named(list, KUBE.nodeReady));
  const mine = pods.filter((p) => p.node === name && isLive(p));
  return {
    name,
    cluster: list.map((s) => attrOf(s, "k8s.cluster.name")).find(Boolean) ?? mine.find((p) => p.cluster)?.cluster ?? "",
    ready: ready === null ? null : ready >= 1,
    cpu: newestValue(named(list, KUBE.nodeCpu)),
    cpuAlloc: newestValue(named(list, KUBE.nodeCpuAlloc)),
    memory: newestValue(named(list, KUBE.nodeMem)),
    memAlloc: newestValue(named(list, KUBE.nodeMemAlloc)),
    pods: mine.length,
    pending: mine.filter((p) => p.phase === "Pending").length,
    restartsNew: mine.reduce((t, p) => t + p.restartsNew, 0),
    host: hosts.has(name),
    lastSeenMs: Math.max(seenOf(list), ...mine.map((p) => p.lastSeenMs)),
  };
}

/** Every node: those with node series, and those that only pods name. */
export function nodesOf(series: readonly Series[], pods: readonly PodRow[], hosts: ReadonlySet<string>): NodeRow[] {
  const byName = nodeSeries(series);
  for (const p of pods) if (p.node && !byName.has(p.node)) byName.set(p.node, []);
  return [...byName].map(([name, list]) => nodeOf(name, list, pods, hosts)).sort((a, b) => a.name.localeCompare(b.name));
}

const STATE: { kind: string; key: string; desired: string; ready: string }[] = [
  { kind: "Deployment", key: "k8s.deployment.name", desired: KUBE.deployDesired, ready: KUBE.deployAvailable },
  { kind: "StatefulSet", key: "k8s.statefulset.name", desired: KUBE.stsDesired, ready: KUBE.stsReady },
  { kind: "DaemonSet", key: "k8s.daemonset.name", desired: KUBE.dsDesired, ready: KUBE.dsReady },
  { kind: "Job", key: "k8s.job.name", desired: KUBE.jobDesired, ready: KUBE.jobDone },
];

/** Desired and ready counts per "namespace/Kind/name", from k8s_cluster. */
function workloadState(series: readonly Series[]): Map<string, { desired: number | null; ready: number | null }> {
  const out = new Map<string, { desired: number | null; ready: number | null }>();
  for (const st of STATE) {
    const by = groupBy(series.filter((s) => s.name === st.desired || s.name === st.ready), (s) => {
      const name = attrOf(s, st.key);
      return name ? `${attrOf(s, "k8s.namespace.name")}/${st.kind}/${name}` : "";
    });
    for (const [key, list] of by) out.set(key, { desired: newestValue(named(list, st.desired)), ready: newestValue(named(list, st.ready)) });
  }
  return out;
}

/** Every workload: those k8s_cluster reports, and those pods name. */
export function workloadsOf(series: readonly Series[], pods: readonly PodRow[]): WorkloadRow[] {
  const state = workloadState(series);
  const keys = new Set([...state.keys(), ...pods.filter((p) => p.workload).map((p) => `${p.namespace}/${p.workload}`)]);
  return [...keys]
    .map((key) => {
      const [namespace = "", kind = "", ...rest] = key.split("/");
      const mine = pods.filter((p) => `${p.namespace}/${p.workload}` === key && isLive(p));
      const s = state.get(key);
      const sum = (f: (p: PodRow) => number) => sumOf(mine.map(f)) ?? 0;
      return { key, namespace, kind, name: rest.join("/"), desired: s?.desired ?? null, ready: s?.ready ?? null, pods: mine.length, pending: mine.filter((p) => p.phase === "Pending").length, restartsNew: sum((p) => p.restartsNew), oomKills: sum((p) => p.oomKills) };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
