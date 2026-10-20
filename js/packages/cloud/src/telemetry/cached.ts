import type { TelemetryStore, TenantScope } from "./store.js";

// Every page asks for a project's counts and environments; each answer scans the project's rows, so it is shared for a minute.
const TTL_MS = 60_000;

interface Memo<T> {
  get(key: string): Promise<T>;
  drop(key: string): void;
  /** Drop every key that `match` picks. */
  dropIf(match: (key: string) => boolean): void;
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
    dropIf: (match) => [...entries.keys()].filter(match).forEach((k) => entries.delete(k)),
  };
}

/** A scope as a memo key: the organization, then the sorted projects. */
const keyOf = (s: TenantScope) => JSON.stringify([s.org, [...s.projects].sort()]);

/** The store with counts and environments shared between callers for a minute (new data shows within it); clearing a project drops every scope with it. */
export function withCachedCounts(store: TelemetryStore, now: () => number): TelemetryStore {
  const scopes = new Map<string, TenantScope>();
  const remember = (s: TenantScope) => (scopes.set(keyOf(s), s), keyOf(s));
  const counts = memo((key) => store.counts(scopes.get(key)!), now);
  const envs = memo((key) => store.traceEnvs(scopes.get(key)!), now);
  const holds = (id: string) => (key: string) => !!scopes.get(key)?.projects.includes(id);
  return {
    ...store,
    counts: (s) => counts.get(remember(s)),
    traceEnvs: (s) => envs.get(remember(s)),
    clearProject: (id) => (counts.dropIf(holds(id)), envs.dropIf(holds(id)), store.clearProject(id)),
  };
}
