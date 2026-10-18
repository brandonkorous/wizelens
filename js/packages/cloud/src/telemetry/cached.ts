import type { TelemetryStore } from "./store.js";

// Every page asks for a project's counts and environments; each answer scans the project's rows, so it is shared for a minute.
const TTL_MS = 60_000;

interface Memo<T> {
  get(key: string): Promise<T>;
  drop(key: string): void;
}

/** One call per key at a time, and its answer kept for `ttlMs`; a failed call is not kept. */
export function memo<T>(fn: (key: string) => Promise<T>, now: () => number, ttlMs = TTL_MS): Memo<T> {
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  return {
    get(key) {
      const hit = entries.get(key);
      if (hit && now() - hit.at < ttlMs) return hit.value;
      const value = fn(key);
      entries.set(key, { at: now(), value });
      value.catch(() => entries.get(key)?.value === value && entries.delete(key));
      return value;
    },
    drop: (key) => void entries.delete(key),
  };
}

/** The store with project counts and environments shared between callers for a minute (new data shows within it); clearing a project drops them. */
export function withCachedCounts(store: TelemetryStore, now: () => number): TelemetryStore {
  const counts = memo((id) => store.counts(id), now);
  const envs = memo((id) => store.traceEnvs(id), now);
  return {
    ...store,
    counts: (id) => counts.get(id),
    traceEnvs: (id) => envs.get(id),
    clearProject: (id) => (counts.drop(id), envs.drop(id), store.clearProject(id)),
  };
}
