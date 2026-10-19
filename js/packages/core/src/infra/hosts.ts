// The Hosts page: every host that sends hostmetrics, its CPU, memory, disks, and network, and the services that run on it.
import { bucketStarts, type TimeRange, type TimeWindow } from "../stats/common.js";
import type { HubService } from "../hub.js";
import { METRIC_BUCKETS, type MetricData } from "../metrics/from-rollups.js";
import { isLive, podsOf } from "./kube-pods.js";
import { cpuLine, type FileSystemRow, fileSystemsOf, hostNumbers, type HostNumbers, ioLine, memLine } from "./host-stats.js";
import { HOST, KUBE } from "./names.js";
import { attrOf, avgOf, groupBy, type Line, named, type Series, seenOf } from "./series.js";
import { servicesOn, type InfraService } from "./services.js";

export interface HostRow extends HostNumbers {
  name: string;
  os: string;
  cluster: string;
  /** A Kubernetes node of the same name sends kubelet metrics. */
  node: boolean;
  lastSeenMs: number;
  services: string[];
}

export interface HostDetail {
  row: HostRow;
  buckets: number[];
  cpu: Line;
  memory: Line;
  diskRead: Line;
  diskWrite: Line;
  netIn: Line;
  netOut: Line;
  fileSystems: FileSystemRow[];
  services: InfraService[];
  /** Pods on this host when it is a Kubernetes node ("namespace/name"). */
  pods: string[];
}

export interface HostsModel {
  meta: { range: TimeRange; window: TimeWindow };
  summary: { hosts: number; cpu: number | null; mem: number | null; services: number };
  hosts: HostRow[];
  selected: HostDetail | null;
}

const HOST_NAMES = new Set<string>(Object.values(HOST));

function rowOf(name: string, list: readonly Series[], nodes: ReadonlySet<string>, services: InfraService[]): HostRow {
  const os = attrOf(list.find((s) => attrOf(s, "os.type")) ?? list[0]!, "os.type");
  const cluster = attrOf(list.find((s) => attrOf(s, "k8s.cluster.name")) ?? list[0]!, "k8s.cluster.name");
  const names = [...new Set(services.map((s) => s.service))].sort();
  return { name, os, cluster, node: nodes.has(name), lastSeenMs: seenOf(list), services: names, ...hostNumbers(list) };
}

function detailOf(d: MetricData, row: HostRow, list: readonly Series[], services: InfraService[], pods: string[]): HostDetail {
  return {
    row,
    buckets: bucketStarts(d.window, METRIC_BUCKETS),
    cpu: cpuLine(list),
    memory: memLine(list),
    diskRead: ioLine(list, HOST.diskIo, "read"),
    diskWrite: ioLine(list, HOST.diskIo, "write"),
    netIn: ioLine(list, HOST.netIo, "receive"),
    netOut: ioLine(list, HOST.netIo, "transmit"),
    fileSystems: fileSystemsOf(list),
    services,
    pods,
  };
}

/** The Hosts page from infrastructure data and the service registry. `q` filters hosts by name or service; `host` picks one. */
export function hostsModelOf(d: MetricData, registry: readonly HubService[]): HostsModel {
  const hosts = groupBy(d.series.filter((s) => HOST_NAMES.has(s.name)), (s) => attrOf(s, "host.name"));
  const nodes = new Set(named(d.series, KUBE.nodeCpu).concat(named(d.series, KUBE.nodeMem)).map((s) => attrOf(s, "k8s.node.name")));
  const pods = podsOf(d.series, registry);
  const podNames = new Map(pods.filter((p) => p.node).map((p) => [p.name, p.node]));
  const livePods = (node: string) => pods.filter((p) => p.node === node && isLive(p)).map((p) => p.key);
  const q = (d.params.q ?? "").toLowerCase();
  const all = [...hosts].map(([name, list]) => rowOf(name, list, nodes, servicesOn(registry, name, podNames)));
  const rows = all.filter((r) => !q || r.name.toLowerCase().includes(q) || r.services.some((s) => s.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  const pick = d.params.host ? all.find((r) => r.name === d.params.host) : undefined;
  return {
    meta: { range: d.range, window: d.window },
    summary: { hosts: rows.length, cpu: avgOf(rows.map((r) => r.cpu)), mem: avgOf(rows.map((r) => r.mem)), services: new Set(rows.flatMap((r) => r.services)).size },
    hosts: rows,
    selected: pick ? detailOf(d, pick, hosts.get(pick.name)!, servicesOn(registry, pick.name, podNames), livePods(pick.name)) : null,
  };
}
