import { type Trace, type TraceSummary, traceTiming } from "@wizeworks/lens-core";
import type { RequestStore } from "./request-store.js";
import { mergeRequests, serverStatsFromTrace, summaryToRequest } from "./requests.js";

export interface ServerDataOptions {
  endpointUrl: string;
  base: string;
  sessionId: string;
  maxRecent: number;
  store: RequestStore;
  /** False: never read from the server (its dashboard is off). A promise: reads wait for its answer. */
  readServer: boolean | Promise<boolean>;
  getFetch(): typeof fetch | undefined;
}

const JSON_ACCEPT = { headers: { Accept: "application/json" } };

/** Reads traces from the WizeLens API: full traces for the HUD, and this tab's earlier requests. */
export class ServerData {
  readonly #o: ServerDataOptions;
  readonly #traces = new Map<string, Trace>();
  readonly #statsLoaded = new Set<string>();
  readonly #endpoints = new Map<string, string>();
  #restoring: Promise<void> | null = null;

  constructor(options: ServerDataOptions) {
    this.#o = options;
  }

  /** A trace answered by another WizeLens server than the configured one. Its data is read there. */
  noteEndpoint(traceId: string, endpoint: string): void {
    this.#endpoints.set(traceId, endpoint);
    for (const id of this.#endpoints.keys()) {
      if (this.#endpoints.size <= this.#o.maxRecent * 4) break;
      this.#endpoints.delete(id);
    }
  }

  /** The WizeLens base URL that holds this trace. */
  endpointOf(traceId: string): string {
    return this.#endpoints.get(traceId) ?? this.#o.endpointUrl;
  }

  getTrace(traceId: string): Trace | null {
    return this.#traces.get(traceId) ?? null;
  }

  async loadTrace(traceId: string): Promise<Trace | null> {
    const get = (await this.#o.readServer) ? this.#o.getFetch() : undefined;
    if (typeof get !== "function") return this.getTrace(traceId);
    try {
      const res = await get(`${this.endpointOf(traceId)}/api/traces/${traceId}?federate=true`, JSON_ACCEPT);
      const trace = res.ok ? ((await res.json()) as Trace) : null;
      if (!trace || !Array.isArray(trace.spans)) return this.getTrace(traceId);
      this.#keep(traceId, trace);
      return trace;
    } catch {
      return this.getTrace(traceId);
    }
  }

  async loadServerStats(traceId: string, retry = true): Promise<void> {
    if (this.#statsLoaded.has(traceId)) return;
    this.#statsLoaded.add(traceId);
    if (!(await this.#o.readServer)) return;
    const trace = await this.loadTrace(traceId);
    const server = trace ? serverStatsFromTrace(trace) : null;
    if (!trace || !server || server.durationMs === null) {
      // The trace is not complete yet. Try one more time.
      this.#statsLoaded.delete(traceId);
      if (retry) setTimeout(() => void this.loadServerStats(traceId, false), 1500);
      return;
    }
    const renderMs = traceTiming(trace).renderMs;
    const store = this.#o.store;
    store.set(store.get().map((r) => (r.traceId === traceId ? { ...r, server, renderMs: r.renderMs ?? renderMs } : r)));
  }

  restore(): Promise<void> {
    return (this.#restoring ??= this.#readRestored());
  }

  #keep(traceId: string, trace: Trace): void {
    this.#traces.delete(traceId);
    this.#traces.set(traceId, trace);
    for (const id of this.#traces.keys()) {
      if (this.#traces.size <= this.#o.maxRecent) break;
      this.#traces.delete(id);
    }
  }

  async #readRestored(): Promise<void> {
    const { getFetch, sessionId, maxRecent, endpointUrl, store, base, readServer } = this.#o;
    const get = (await readServer) ? getFetch() : undefined;
    if (typeof get !== "function") return;
    try {
      const q = new URLSearchParams({ session: sessionId, limit: String(maxRecent) });
      const res = await get(`${endpointUrl}/api/traces?${q}`, JSON_ACCEPT);
      if (!res.ok) return;
      const summaries = (await res.json()) as TraceSummary[];
      if (!Array.isArray(summaries)) return;
      store.set(mergeRequests(store.get(), summaries.map((t) => summaryToRequest(t, base)), maxRecent));
    } catch {
      // Server down or old version: start with an empty list.
    }
  }
}
