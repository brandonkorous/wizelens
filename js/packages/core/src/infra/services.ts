// Which services run on a host or in a pod, from the service registry.
import type { HubService } from "../hub.js";

/** One registry row as the infrastructure pages show it. */
export interface InfraService {
  service: string;
  environment: string;
  version: string;
  host: string;
  /** The Kubernetes pod, when the sender names it. */
  pod: string;
  online: boolean;
  lastSeenMs: number;
}

const rowOf = (s: HubService): InfraService => ({
  service: s.service,
  environment: s.environment ?? "",
  version: s.version ?? "",
  host: s.host ?? "",
  pod: s.k8s?.pod ?? "",
  online: s.online,
  lastSeenMs: s.lastSeenMs,
});

const sorted = (list: readonly HubService[]) => list.map(rowOf).sort((a, b) => a.service.localeCompare(b.service) || a.host.localeCompare(b.host));

/** The pod a registry row runs in: its Kubernetes pod, or its host name (a pod's host name is the pod's name). */
const podOf = (s: HubService) => s.k8s?.pod || s.host || "";

/** Services on a host: by host name, by Kubernetes node, or in a pod that runs on that node. */
export function servicesOn(registry: readonly HubService[], host: string, podNodes: ReadonlyMap<string, string>): InfraService[] {
  return sorted(registry.filter((s) => s.host === host || s.k8s?.node === host || podNodes.get(podOf(s)) === host));
}

/** Services in one pod. A row that names its namespace must match it. */
export function servicesInPod(registry: readonly HubService[], ns: string, pod: string): InfraService[] {
  return sorted(registry.filter((s) => podOf(s) === pod && (!s.k8s?.namespace || !ns || s.k8s.namespace === ns)));
}
