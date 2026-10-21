import { vi } from "vitest";
import type { Trace } from "@wizeworks/lens-core";
import { resetStoredMemory } from "./hud/storage.js";
import type { RecordedRequest, Recorder, ServerStats } from "./recorder-types.js";
import { createRequestStore, type RequestStore } from "./request-store.js";
import { now } from "./session.js";

// HUD test helpers: a recorder fed by hand, request rows, and a localStorage.
export interface FakeRecorder extends Recorder {
  store: RequestStore;
  traces: Map<string, Trace>;
  statsLoads: string[];
  listeners(): number;
}

export function fakeRecorder(): FakeRecorder {
  const store = createRequestStore(30);
  const traces = new Map<string, Trace>();
  const statsLoads: string[] = [];
  let listening = 0;
  return {
    store,
    traces,
    statsLoads,
    listeners: () => listening,
    endpointUrl: "http://app.test/_wizelens",
    sessionId: "sess-1",
    install: () => () => {},
    subscribe(fn) {
      listening++;
      const off = store.subscribe(fn);
      return () => (listening--, off());
    },
    getSnapshot: store.get,
    flush: async () => {},
    restore: async () => {},
    loadServerStats: async (id) => void statsLoads.push(id),
    getTrace: (id) => traces.get(id) ?? null,
    loadTrace: async (id) => traces.get(id) ?? null,
    traceLink: (id, view) => `http://app.test/_wizelens/#/traces/${id}${view ? `/${view}` : ""}`,
    pageView: () => {},
    captureError: () => {},
    clear: store.clear,
  };
}

export const serverStats = (over: Partial<ServerStats> = {}): ServerStats => ({
  name: "GET /api/orders",
  durationMs: 186,
  dbCount: 4,
  dbMs: 92,
  dbTotalMs: 92,
  dbSlowestMs: 48,
  dbDurations: [48, 20, 14, 10],
  httpClientCount: 2,
  errorCount: 0,
  insights: 0,
  parts: { codeMs: 50, dbMs: 92, httpOutMs: 44, httpOutCount: 2 },
  services: ["api"],
  ...over,
});

export const row = (over: Partial<RecordedRequest> = {}): RecordedRequest => ({
  id: "s1",
  method: "GET",
  url: "http://app.test/api/orders/1284",
  path: "/api/orders/1284",
  status: 200,
  durationMs: 243,
  renderMs: 41,
  traceId: "t1",
  profiled: true,
  startMs: now() - 1000,
  error: null,
  ...over,
});

/** A localStorage backed by a map, and a fresh memory copy. Returns the map. */
export function stubLocalStorage(): Map<string, string> {
  const local = new Map<string, string>();
  resetStoredMemory();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => void local.set(k, v),
  });
  return local;
}
