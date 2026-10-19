import type { RecordedRequest } from "./recorder-types.js";

/** The HUD's list of recent requests, newest first. */
export interface RequestStore {
  get(): readonly RecordedRequest[];
  set(rows: readonly RecordedRequest[]): void;
  /** Add or replace a row. A live row replaces a restored row of the same trace. */
  upsert(req: RecordedRequest): void;
  patch(id: string, fields: Partial<RecordedRequest>): void;
  subscribe(listener: () => void): () => void;
  clear(): void;
}

export function createRequestStore(max: number): RequestStore {
  let recent: readonly RecordedRequest[] = [];
  const listeners = new Set<() => void>();
  const set = (rows: readonly RecordedRequest[]) => {
    recent = rows;
    listeners.forEach((l) => l());
  };
  return {
    get: () => recent,
    set,
    upsert(req) {
      const rest = recent.filter((r) => r.id !== req.id && !(r.restored && r.traceId === req.traceId));
      set([req, ...rest].slice(0, max));
    },
    patch: (id, fields) => set(recent.map((r) => (r.id === id ? { ...r, ...fields } : r))),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear: () => set([]),
  };
}

/** Counts installs. `start` runs on the first, `stop` when the last one is undone. */
export function createInstaller(hooks: { start(): void; stop(): void }): () => () => void {
  let installs = 0;
  return function install() {
    if (typeof globalThis.fetch !== "function") return () => {};
    installs++;
    if (installs === 1) hooks.start();
    let undone = false;
    return () => {
      if (undone) return;
      undone = true;
      installs--;
      if (installs === 0) hooks.stop();
    };
  };
}
