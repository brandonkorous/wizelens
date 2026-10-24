// Calls to hosts inside the same cluster (`api`, `api-rest.ns.svc.cluster.local`): dependencies of the app, not outside services.
const CLUSTER_SUFFIX = /\.(?:svc\.cluster\.local|cluster\.local|svc)$/;

const hostname = (host: string): string => host.replace(/^\[|\]$/g, "").replace(/:\d+$/, "").toLowerCase();

/** True for a dotless host (a Kubernetes or Docker service name) or a cluster DNS name; not localhost or an IP. */
export function isInClusterHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = hostname(host);
  if (!h || h === "localhost" || /^[\d.]+$/.test(h) || h.includes(":")) return false;
  return !h.includes(".") || CLUSTER_SUFFIX.test(h);
}

/** How an in-cluster host shows: its service name, "api-rest (in-cluster)"; other hosts as they are. */
export const externalName = (host: string): string => (isInClusterHost(host) ? `${hostname(host).split(".")[0]} (in-cluster)` : host);

/** A Services row of an in-cluster call: the app's own dependency, which follows the app's traffic and is no anomaly of its own. */
export const isClusterDependency = (row: { kind: string; detail: string | null } | null): boolean => row?.kind === "external" && isInClusterHost(row.detail);
