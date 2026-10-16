import { mergeTraces, type ServiceInfo, type Trace } from "@wizeworks/lens-core";
import { getScope, onPrefChange, type Scope } from "./prefs";
import { type HubRegistry, loadInfo, loadRegistry, loadTraces, newSource, normalizeEndpoint, selfEndpoint, type Source } from "./sources";

export interface DataSnapshot {
  sources: Source[];
  /** Every known trace, merged across services, newest first. */
  traces: Trace[];
  /** Info of the service that serves this dashboard. */
  info: ServiceInfo | null;
  /** True until the first poll of this service finished. */
  loading: boolean;
  /** When the data last changed (epoch ms). Pages use it as "now". */
  updatedMs: number;
  /** The services a hub knows. Null when this dashboard is not served by a hub. */
  registry: HubRegistry | null;
}

const POLL_MS = 5000;
const OVERLAP_MS = 30_000;
const KEEP_MS = 48 * 60 * 60_000;

const isHub = (info: ServiceInfo | null) => !!info?.capabilities?.includes("registry");
/** Hosts that compute page numbers keep only recent traces here, for the bell and search. */
const RECENT_LIMIT = 300;
const limitFor = (info: ServiceInfo | null) => (info?.capabilities?.includes("serverStats") ? RECENT_LIMIT : undefined);
const scopeKey = (s: Scope) => `${s.env}
${s.project}`;

/** A service outside the hub is read only when it fits the chosen environment and project. */
const fitsScope = (info: ServiceInfo | null, s: Scope) =>
  (!s.env || info?.environment === s.env) && (!s.project || info?.project === s.project);

const samePart = (a: Trace, b: Trace) =>
  a.spanCount === b.spanCount && a.logs.length === b.logs.length && a.durationMs === b.durationMs && a.remotes.length === b.remotes.length;

/** Polls every known service and keeps one merged trace per trace id. */
export class DataStore {
  readonly #sources = new Map<string, Source>();
  readonly #parts = new Map<string, Map<string, Trace>>();
  readonly #merged = new Map<string, Trace>();
  readonly #listeners = new Set<() => void>();
  readonly #lastPoll = new Map<string, number>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  #registry: HubRegistry | null = null;
  #scope: Scope = getScope();
  #snapshot: DataSnapshot = { sources: [], traces: [], info: null, loading: true, updatedMs: Date.now(), registry: null };

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): DataSnapshot => this.#snapshot;

  start(): void {
    const self = selfEndpoint();
    this.#sources.set(self, newSource(self, true));
    document.addEventListener("visibilitychange", () => !document.hidden && this.refresh());
    onPrefChange(() => this.#onScope(getScope()));
    this.refresh();
  }

  /** A new environment or project: drop what was loaded and load again. */
  #onScope(scope: Scope): void {
    if (scopeKey(scope) === scopeKey(this.#scope)) return;
    this.#scope = scope;
    this.#parts.clear();
    this.#merged.clear();
    this.#lastPoll.clear();
    for (const s of this.#sources.values()) if (s.self) s.info = null;
    this.#emit();
    this.refresh();
  }

  /** Poll now, then keep polling while the tab is visible. */
  refresh(): void {
    if (this.#timer) clearTimeout(this.#timer);
    void this.#pollAll().finally(() => {
      this.#timer = document.hidden ? null : setTimeout(() => this.refresh(), POLL_MS);
    });
  }

  async #pollAll(): Promise<void> {
    const done = new Set<string>();
    for (let round = 0; round < 4; round++) {
      const todo = [...this.#sources.values()].filter((s) => !done.has(s.endpoint));
      if (todo.length === 0) break;
      for (const s of todo) done.add(s.endpoint);
      await Promise.all(todo.map((s) => this.#pollSource(s)));
    }
    await this.#pollRegistry();
    this.#emit();
  }

  async #pollRegistry(): Promise<void> {
    const self = [...this.#sources.values()].find((s) => s.self);
    if (!self || !isHub(self.info)) return;
    try {
      this.#registry = await loadRegistry(self.endpoint, this.#scope);
    } catch {
      // Keep the last list. The source status already shows when the hub is down.
    }
  }

  async #pollSource(source: Source): Promise<void> {
    const started = Date.now();
    const last = this.#lastPoll.get(source.endpoint);
    try {
      if (!source.info) source.info = await loadInfo(source.endpoint, source.self ? this.#scope : null);
      const hub = source.self && isHub(source.info);
      const selfInfo = [...this.#sources.values()].find((s) => s.self)?.info ?? null;
      const skip = !source.self && isHub(selfInfo) && !fitsScope(source.info, this.#scope);
      const since = last === undefined ? null : last - OVERLAP_MS;
      const traces = skip ? [] : await loadTraces(source.endpoint, since, hub ? this.#scope : null, limitFor(source.info));
      this.#lastPoll.set(source.endpoint, started);
      this.#ingest(source.endpoint, traces);
      Object.assign(source, { status: "ok", error: null, lastOkMs: started });
    } catch (err) {
      Object.assign(source, { status: "down", error: err instanceof Error ? err.message : String(err) });
    }
  }

  #ingest(endpoint: string, traces: readonly Trace[]): void {
    for (const t of traces) {
      let parts = this.#parts.get(t.traceId);
      if (!parts) this.#parts.set(t.traceId, (parts = new Map()));
      const old = parts.get(endpoint);
      if (old && samePart(old, t)) continue;
      parts.set(endpoint, t);
      const all = [...parts.values()];
      this.#merged.set(t.traceId, mergeTraces(t.traceId, all));
      for (const r of t.remotes) this.#discover(r);
    }
  }

  #discover(remote: string): void {
    const endpoint = normalizeEndpoint(remote);
    if (!this.#sources.has(endpoint)) this.#sources.set(endpoint, newSource(endpoint, false));
  }

  #prune(now: number): void {
    for (const [id, t] of this.#merged) {
      if (t.startMs + t.durationMs >= now - KEEP_MS) continue;
      this.#merged.delete(id);
      this.#parts.delete(id);
    }
  }

  #emit(): void {
    const now = Date.now();
    this.#prune(now);
    const sources = [...this.#sources.values()].map((s) => ({ ...s }));
    const self = sources.find((s) => s.self);
    const traces = [...this.#merged.values()].sort((a, b) => b.startMs - a.startMs);
    const info = self?.info ?? null;
    const registry = isHub(info) ? this.#registry : null;
    this.#snapshot = { sources, traces, info, loading: self?.status === "pending", updatedMs: now, registry };
    for (const l of this.#listeners) l();
  }
}

