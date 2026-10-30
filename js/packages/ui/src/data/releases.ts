// Release markers for charts: the versions the open page's model says first sent data in its window.
import { useSyncExternalStore } from "react";
import type { Release } from "@wizeworks/lens-core/internal";
import { useServiceScope } from "./prefs";

const listeners = new Set<() => void>();
let current: readonly Release[] = [];

/** Pages call this with their model's `meta.releases`. */
export function publishReleases(list: readonly Release[] | undefined): void {
  if (!list || JSON.stringify(list) === JSON.stringify(current)) return;
  current = list;
  for (const l of listeners) l();
}

/** The releases to mark: the chosen service's, or every service's when none is chosen. */
export function useReleases(): readonly Release[] {
  const all = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current);
  const [service] = useServiceScope();
  return service ? all.filter((r) => r.service === service) : all;
}
