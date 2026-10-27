import { useSyncExternalStore } from "react";
import type { Trace } from "@wizeworks/lens-core";
import { loadTrace } from "./sources";
import { type DataSnapshot, DataStore } from "./store";

/** Where the dashboard gets its data. Screens use this, never a store or an endpoint directly. */
export interface DataProvider {
  /** "local": full traces come to the browser and the numbers are computed here (in-app and hub). */
  readonly kind: "local";
  subscribe(listener: () => void): () => void;
  getSnapshot(): DataSnapshot;
  start(): void;
  refresh(): void;
  /** Read the host's info again, after a setting it reports has changed. */
  reloadInfo(): void;
  /** One full trace, merged across services. */
  loadTrace(traceId: string): Promise<Trace>;
}

// A "server" provider comes with hosts that offer the serverStats capability: it will ask for ready-made numbers.

class LocalProvider extends DataStore implements DataProvider {
  readonly kind = "local" as const;
  loadTrace = (traceId: string): Promise<Trace> => loadTrace(traceId);
}

export const provider: DataProvider = new LocalProvider();

export function useData(): DataSnapshot {
  return useSyncExternalStore(provider.subscribe, provider.getSnapshot);
}
