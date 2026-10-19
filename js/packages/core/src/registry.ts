import type { HubSender, HubService } from "./hub.js";

/** A host (pod) offline this long is old: the registry hides it unless asked. */
export const OLD_INSTANCE_MS = 24 * 60 * 60_000;

/** One service in one project and environment, with every host (pod) that sent for it. */
export interface ServiceGroup {
  key: string;
  service: string;
  project?: string;
  environment?: string;
  /** Hosts, newest first. */
  instances: HubService[];
  /** How many hosts are online now. */
  online: number;
  /** The newest host: its runtime and sender kind stand for the group. */
  newest: HubService;
}

/** The group a sender's rows belong to: project, service, and environment, but not host. */
export const groupKeyOf = (s: HubSender): string => `${s.project ?? ""}|${s.service}|${s.environment ?? ""}`;

/** True for a host that has been offline longer than `OLD_INSTANCE_MS`. */
export const isOldInstance = (s: HubService, now: number): boolean => !s.online && now - s.lastSeenMs > OLD_INSTANCE_MS;

/** Registry rows grouped by service, so many pods of one app make one row. Groups keep the order of their newest host. */
export function groupServices(list: readonly HubService[]): ServiceGroup[] {
  const byKey = new Map<string, HubService[]>();
  for (const s of list) {
    const key = groupKeyOf(s);
    const rows = byKey.get(key);
    if (rows) rows.push(s);
    else byKey.set(key, [s]);
  }
  const groups = [...byKey].map(([key, rows]): ServiceGroup => {
    const instances = [...rows].sort((a, b) => b.lastSeenMs - a.lastSeenMs);
    const newest = instances[0]!;
    const online = instances.filter((s) => s.online).length;
    return { key, service: newest.service, project: newest.project, environment: newest.environment, instances, online, newest };
  });
  return groups.sort((a, b) => b.newest.lastSeenMs - a.newest.lastSeenMs);
}
