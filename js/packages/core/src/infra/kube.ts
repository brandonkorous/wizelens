// The Kubernetes page: clusters, nodes, workloads, and pods, with restarts, out-of-memory kills, and pending pods.
import type { HubService } from "../hub.js";
import { METRIC_BUCKETS, type MetricData } from "../metrics/from-rollups.js";
import { bucketStarts, type TimeRange, type TimeWindow } from "../stats/common.js";
import { podRef } from "./data.js";
import { nodeSeries, nodesOf, type NodeRow, workloadsOf, type WorkloadRow } from "./kube-nodes.js";
import { containersOf, type ContainerRow, isLive, podSeries, podsOf, type PodRow } from "./kube-pods.js";
import { HOST, KUBE } from "./names.js";
import { attrOf, directionOf, type Line, lineOf, mergeLines, named, type Series } from "./series.js";
import { type InfraService, servicesInPod, servicesOn } from "./services.js";

interface Charts {
  buckets: number[];
  cpu: Line;
  memory: Line;
  netIn: Line;
  netOut: Line;
}

export interface NodeDetail extends Charts {
  row: NodeRow;
  pods: PodRow[];
  services: InfraService[];
}

export interface PodDetail extends Charts {
  row: PodRow;
  containers: ContainerRow[];
  services: InfraService[];
}

export interface KubeSummary {
  nodes: number;
  readyNodes: number;
  pods: number;
  running: number;
  pending: number;
  failed: number;
  restartsNew: number;
  oomKills: number;
  workloads: number;
}

export interface KubeModel {
  meta: { range: TimeRange; window: TimeWindow };
  clusters: string[];
  namespaces: string[];
  summary: KubeSummary;
  nodes: NodeRow[];
  workloads: WorkloadRow[];
  pods: PodRow[];
  node: NodeDetail | null;
  pod: PodDetail | null;
}

const isKube = (s: Series) => s.name.startsWith("k8s.");
const HOST_NAMES = new Set<string>(Object.values(HOST));

function chartsOf(d: MetricData, list: readonly Series[], cpu: readonly string[], mem: string, net: string): Charts {
  const io = (dir: string) => mergeLines(named(list, net).filter((s) => directionOf(s) === dir).map(lineOf));
  return { buckets: bucketStarts(d.window, METRIC_BUCKETS), cpu: mergeLines(named(list, cpu).map(lineOf)), memory: mergeLines(named(list, mem).map(lineOf)), netIn: io("receive"), netOut: io("transmit") };
}

function summaryOf(nodes: readonly NodeRow[], listed: readonly PodRow[], workloads: readonly WorkloadRow[]): KubeSummary {
  const pods = listed.filter(isLive);
  const phase = (p: string) => pods.filter((x) => x.phase === p).length;
  return {
    nodes: nodes.length,
    readyNodes: nodes.filter((n) => n.ready).length,
    pods: pods.length,
    running: phase("Running"),
    pending: phase("Pending"),
    failed: phase("Failed"),
    restartsNew: pods.reduce((t, p) => t + p.restartsNew, 0),
    oomKills: pods.reduce((t, p) => t + p.oomKills, 0),
    workloads: workloads.length,
  };
}

/** Pods the filters keep: namespace, workload, service, and a name search. */
function keepPod(p: PodRow, params: Readonly<Record<string, string>>): boolean {
  const q = (params.q ?? "").toLowerCase();
  if (params.ns && p.namespace !== params.ns) return false;
  if (params.workload && `${p.namespace}/${p.workload}` !== params.workload) return false;
  if (params.service && !p.services.includes(params.service)) return false;
  return !q || p.key.toLowerCase().includes(q) || p.workload.toLowerCase().includes(q) || p.node.toLowerCase().includes(q);
}

function details(d: MetricData, kube: readonly Series[], nodes: NodeRow[], pods: PodRow[], registry: readonly HubService[]) {
  const nodeRow = d.params.node ? nodes.find((n) => n.name === d.params.node) : undefined;
  const ref = d.params.pod ? podRef(d.params.pod) : null;
  const podRow = ref ? pods.find((p) => p.name === ref.name && (ref.ns === null || p.namespace === ref.ns)) : undefined;
  const podNodes = new Map(pods.map((p) => [p.name, p.node]));
  const node: NodeDetail | null = nodeRow
    ? { row: nodeRow, ...chartsOf(d, nodeSeries(kube).get(nodeRow.name) ?? [], KUBE.nodeCpu, KUBE.nodeMem, KUBE.nodeNet), pods: pods.filter((p) => p.node === nodeRow.name), services: servicesOn(registry, nodeRow.name, podNodes) }
    : null;
  const list = podRow ? (podSeries(kube).get(podRow.key) ?? []) : [];
  const pod: PodDetail | null = podRow
    ? { row: podRow, ...chartsOf(d, list, KUBE.podCpu, KUBE.podMem, KUBE.podNet), containers: containersOf(list), services: servicesInPod(registry, podRow.namespace, podRow.name) }
    : null;
  return { node, pod };
}

/** The Kubernetes page from infrastructure data and the service registry. `cluster` narrows to one cluster; `node` and `pod` pick one. */
export function kubeModelOf(d: MetricData, registry: readonly HubService[]): KubeModel {
  const all = d.series.filter(isKube);
  const clusters = [...new Set(all.map((s) => attrOf(s, "k8s.cluster.name")).filter(Boolean))].sort();
  const cluster = d.params.cluster ?? "";
  const kube = cluster ? all.filter((s) => attrOf(s, "k8s.cluster.name") === cluster) : all;
  const hosts = new Set(d.series.filter((s) => HOST_NAMES.has(s.name)).map((s) => attrOf(s, "host.name")));
  const allPods = podsOf(kube, registry);
  const nodes = nodesOf(kube, allPods, hosts);
  const workloads = workloadsOf(kube, allPods).filter((w) => !d.params.ns || w.namespace === d.params.ns);
  const pods = allPods.filter((p) => keepPod(p, d.params));
  return {
    meta: { range: d.range, window: d.window },
    clusters,
    namespaces: [...new Set(allPods.map((p) => p.namespace).filter(Boolean))].sort(),
    summary: summaryOf(nodes, pods, workloads),
    nodes,
    workloads,
    pods,
    ...details(d, kube, nodes, allPods, registry),
  };
}
