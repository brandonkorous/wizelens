// Worker threads for settle: the CPU work of a batch runs off the main thread, so ingest and pages stay fast and settle uses more cores.
import { Worker } from "node:worker_threads";
import type { ProjectRunner, ProjectTask } from "./settle-work.js";

export interface SettlePoolOptions {
  /** The ClickHouse URL; each worker opens its own client. */
  url: string;
  size: number;
  /** The worker file. Default: the built `settle-worker.js` next to this file. */
  entry?: URL;
  execArgv?: string[];
}

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

interface Slot {
  worker: Worker;
  pending: Map<number, Waiter>;
}

export class SettlePool {
  private readonly slots: Slot[] = [];
  private readonly o: SettlePoolOptions;
  private lastId = 0;
  private closed = false;

  constructor(o: SettlePoolOptions) {
    this.o = o;
    for (let i = 0; i < o.size; i++) this.slots.push(this.spawn());
  }

  get size(): number {
    return this.slots.length;
  }

  private spawn(): Slot {
    const entry = this.o.entry ?? new URL("./settle-worker.js", import.meta.url);
    const slot: Slot = { worker: new Worker(entry, { workerData: { url: this.o.url }, execArgv: this.o.execArgv }), pending: new Map() };
    slot.worker.on("message", (m: { id: number; error?: string }) => {
      const w = slot.pending.get(m.id);
      slot.pending.delete(m.id);
      if (m.error === undefined) w?.resolve();
      else w?.reject(new Error(m.error));
    });
    slot.worker.on("error", (err) => this.lost(slot, err));
    slot.worker.on("exit", (code) => this.lost(slot, new Error(`A settle worker stopped (exit code ${code}).`)));
    return slot;
  }

  /** A worker died: its tasks fail (their traces settle again later), and a new worker takes its place. */
  private lost(slot: Slot, err: Error): void {
    for (const w of slot.pending.values()) w.reject(err);
    slot.pending.clear();
    const i = this.slots.indexOf(slot);
    if (i < 0 || this.closed) return;
    console.error("[wizelens-cloud] A settle worker failed and was started again:", err.message);
    this.slots[i] = this.spawn();
  }

  /** Settle one project task on the least busy worker. */
  readonly run: ProjectRunner = (task: ProjectTask) => {
    if (this.closed) return Promise.reject(new Error("The settle workers are closed."));
    const slot = this.slots.reduce((a, b) => (b.pending.size < a.pending.size ? b : a));
    const id = ++this.lastId;
    return new Promise<void>((resolve, reject) => {
      slot.pending.set(id, { resolve, reject });
      slot.worker.postMessage({ id, task });
    });
  };

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
  }
}
