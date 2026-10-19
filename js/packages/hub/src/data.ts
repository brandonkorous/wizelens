import { MAX_FEDERATION_HOPS, mergeTraces, type Trace, type TraceSummary, toSummary } from "@wizeworks/lens-core";
import { fetchRemote } from "@wizeworks/lens-node/kit";
import { findTraceIds, getStoredTrace, listServices, loadTraces, type TraceQuery } from "./store-read.js";
import type { HubStore, HubWrite } from "./store.js";

const normalize = (e: string) => e.replace(/\/+$/, "");

/** The hub's data: writes, reads, and federation to add-ons that do not send to the hub. */
export class HubData {
  readonly store: HubStore;
  /** WizeLens endpoints of add-ons that send here. Their parts are already in the hub. */
  readonly #connected = new Set<string>();

  constructor(store: HubStore) {
    this.store = store;
    for (const s of listServices(store.db, store.now())) if (s.endpoint) this.#connected.add(normalize(s.endpoint));
  }

  write(w: HubWrite): void {
    this.store.write(w);
    if (w.sender.endpoint) this.#connected.add(normalize(w.sender.endpoint));
  }

  /** Keep a remote only when the hub does not get that service's data. */
  readonly keepRemote = (endpoint: string): boolean => !this.#connected.has(normalize(endpoint));

  traces(q: TraceQuery): Trace[] {
    return loadTraces(this.store.db, findTraceIds(this.store.db, q), this.keepRemote);
  }

  summaries(q: TraceQuery): TraceSummary[] {
    return this.traces({ ...q, noLoose: true }).map(toSummary);
  }

  /** One trace, plus the parts held by add-ons that do not send here. */
  async getTrace(traceId: string, federate = true, hop = 0): Promise<Trace | undefined> {
    const local = getStoredTrace(this.store.db, traceId, this.keepRemote);
    if (!federate || hop + 1 > MAX_FEDERATION_HOPS) return local;
    const parts = await Promise.all((local?.remotes ?? []).map((r) => fetchRemote(r, traceId, hop)));
    const all = [local, ...parts].filter((t): t is Trace => !!t && Array.isArray(t.spans));
    return all.length ? mergeTraces(traceId, all) : undefined;
  }
}
