// Kubernetes pods and their containers, from kubeletstats and k8s_cluster series.
import type { HubService } from "../hub.js";
import { KUBE, OOM_REASON, POD_PHASES } from "./names.js";
import { attrOf, groupBy, lastOf, named, type Series, seenOf, sumOf } from "./series.js";
import { servicesInPod } from "./services.js";

export interface ContainerRow {
  name: string;
  ready: boolean | null;
  restarts: number;
  /** Restarts since the window began. */
  restartsNew: number;
  /** Why it last stopped, for example "OOMKilled" or "Error". */
  lastExit: string;
  memLimit: number | null;
  cpuLimit: number | null;
}

export interface PodRow {
  /** "namespace/name". */
  key: string;
  name: string;
  namespace: string;
  node: string;
  cluster: string;
  /** "Deployment/api", "StatefulSet/db", or "" when not known. */
  workload: string;
  /** k8s.pod.phase ("Running", "Pending", ...), "Gone" when no longer reported, or "" when not known. */
  phase: string;
  containers: number;
  ready: number;
  restarts: number;
  restartsNew: number;
  /** Containers whose last exit was an out-of-memory kill. */
  oomKills: number;
  /** CPU in cores and memory (working set) in bytes, now. */
  cpu: number | null;
  memory: number | null;
  memLimit: number | null;
  services: string[];
  lastSeenMs: number;
}

/** A pod not reported for this long before the newest data was deleted or replaced. */
export const GONE_MS = 5 * 60_000;
export const GONE = "Gone";

const WORKLOADS: [string, string][] = [
  ["k8s.deployment.name", "Deployment"],
  ["k8s.statefulset.name", "StatefulSet"],
  ["k8s.daemonset.name", "DaemonSet"],
  ["k8s.cronjob.name", "CronJob"],
  ["k8s.job.name", "Job"],
];

/** "Kind/name" of the workload a series names; "" when none. */
export function workloadOf(s: Series): string {
  for (const [key, kind] of WORKLOADS) {
    const v = attrOf(s, key);
    if (v) return `${kind}/${v}`;
  }
  return "";
}

export const podKeyOf = (s: Series): string => {
  const pod = attrOf(s, "k8s.pod.name");
  return pod ? `${attrOf(s, "k8s.namespace.name")}/${pod}` : "";
};

const isPodSeries = (s: Series) => s.name.startsWith("k8s.pod.") || s.name.startsWith("k8s.container.");
const newest = (list: readonly Series[]) => list.reduce((a, b) => (b.total.lastMs > a.total.lastMs ? b : a));
const oldest = (list: readonly Series[]) => list.reduce((a, b) => (b.total.firstMs < a.total.firstMs ? b : a));
const newestValue = (list: readonly Series[]) => (list.length ? lastOf(newest(list)) : null);
const first = (list: readonly Series[], f: (s: Series) => string) => list.map(f).find(Boolean) ?? "";

/** One container from its series (a new series starts when its last exit reason changes). */
function containerOf(name: string, list: readonly Series[]): ContainerRow {
  const restarts = named(list, KUBE.restarts);
  const now = restarts.length ? newest(restarts) : null;
  const last = now ? (lastOf(now) ?? 0) : 0;
  const start = restarts.length ? (oldest(restarts).total.firstV ?? last) : last;
  const ready = newestValue(named(list, KUBE.ready));
  return {
    name,
    ready: ready === null ? null : ready >= 1,
    restarts: last,
    restartsNew: Math.max(0, last - start),
    lastExit: now ? attrOf(now, "k8s.container.status.last_terminated_reason") : "",
    memLimit: newestValue(named(list, KUBE.memLimit)),
    cpuLimit: newestValue(named(list, KUBE.cpuLimit)),
  };
}

/** The containers of one pod, by name. */
export function containersOf(list: readonly Series[]): ContainerRow[] {
  const byName = groupBy(list.filter((s) => s.name.startsWith("k8s.container.")), (s) => attrOf(s, "k8s.container.name"));
  return [...byName].map(([name, ss]) => containerOf(name, ss)).sort((a, b) => a.name.localeCompare(b.name));
}

function podOf(key: string, list: readonly Series[], registry: readonly HubService[]): PodRow {
  const [namespace, name] = [attrOf(list[0]!, "k8s.namespace.name"), attrOf(list[0]!, "k8s.pod.name")];
  const containers = containersOf(list);
  const phase = newestValue(named(list, KUBE.podPhase));
  return {
    key,
    name,
    namespace,
    node: first(list, (s) => attrOf(s, "k8s.node.name")),
    cluster: first(list, (s) => attrOf(s, "k8s.cluster.name")),
    workload: first(list, workloadOf),
    phase: phase === null ? "" : (POD_PHASES[Math.round(phase)] ?? "Unknown"),
    containers: containers.length,
    ready: containers.filter((c) => c.ready).length,
    restarts: containers.reduce((t, c) => t + c.restarts, 0),
    restartsNew: containers.reduce((t, c) => t + c.restartsNew, 0),
    oomKills: containers.filter((c) => c.lastExit === OOM_REASON).length,
    cpu: newestValue(named(list, KUBE.podCpu)),
    memory: newestValue(named(list, KUBE.podMem)),
    memLimit: sumOf(containers.map((c) => c.memLimit)),
    services: [...new Set(servicesInPod(registry, namespace, name).map((s) => s.service))].sort(),
    lastSeenMs: seenOf(list),
  };
}

/** Pod series by "namespace/name". */
export const podSeries = (series: readonly Series[]): Map<string, Series[]> => groupBy(series.filter(isPodSeries), podKeyOf);

/** Every pod with series in the window, by namespace and name. */
export function podsOf(series: readonly Series[], registry: readonly HubService[]): PodRow[] {
  const latest = seenOf(series);
  const pods = [...podSeries(series)].map(([key, list]) => podOf(key, list, registry));
  for (const p of pods) if (p.lastSeenMs < latest - GONE_MS) p.phase = GONE;
  return pods.sort((a, b) => a.key.localeCompare(b.key));
}

/** Pods that still exist: seen within GONE_MS of the newest data. */
export const isLive = (p: PodRow): boolean => p.phase !== GONE;
