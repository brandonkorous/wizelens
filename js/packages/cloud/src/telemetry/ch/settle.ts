// Settling on ClickHouse: the same facts and deltas as Postgres, written as inserts. One process settles, so no lock is needed.
import { factOptionsOf, type ProjectSettings } from "@wizeworks/lens-core";
import type { SettleOptions } from "../store.js";
import type { Dirty, SettleQueue } from "./queue.js";
import type { ProjectRunner } from "./settle-work.js";
import { byProject, nextVer, type RetentionCache } from "./util.js";

const BATCH = 2_000;
const BUDGET_MS = 2_000;

export interface Settler {
  queue: SettleQueue;
  retention: RetentionCache;
  logRetention: RetentionCache;
  /** A project's own settings, for its thresholds. */
  settingsOf?: (projectId: string) => Promise<ProjectSettings>;
  /** Settles one project task: in a worker thread, or in this thread. */
  run: ProjectRunner;
  /** Batches at once: one reads and computes while others wait on their writes. */
  depth: number;
  /** Queues the next page of a stats rebuild, when one runs. */
  refill?: () => Promise<void>;
}

/** Settle one batch of taken traces, one project at a time. A failure releases the ones not written yet. */
async function settleItems(s: Settler, now: number, due: readonly Dirty[], o: SettleOptions): Promise<number> {
  let left = [...due];
  try {
    const days = await s.retention.daysOf(due.map((d) => d.project));
    const logDays = await s.logRetention.daysOf(due.map((d) => d.project));
    for (const [project, items] of byProject(due)) {
      const facts = { ...o.defaultFacts, ...factOptionsOf(await s.settingsOf?.(project)) };
      await s.run({ project, items: [...items], now, retentionMs: days.get(project)! * 86_400_000, logRetentionMs: logDays.get(project)! * 86_400_000, facts, ver: nextVer(now) });
      for (const d of items) s.queue.settled(d, d.updatedMs);
      left = left.filter((d) => d.project !== project);
      o.onSettled?.(project);
    }
    return due.length;
  } finally {
    s.queue.release(left);
  }
}

/** Settle due traces until none are left or the budget is spent, with up to `depth` batches at once. */
export async function settleClickHouse(s: Settler, now: number, o: SettleOptions = {}): Promise<number> {
  const start = Date.now();
  const batch = o.batch ?? BATCH;
  const running: Promise<number>[] = [];
  const started: Promise<number>[] = [];
  let total = 0;
  await s.refill?.();
  try {
    for (;;) {
      const due = s.queue.take(now, batch);
      if (due.length) {
        const run = settleItems(s, now, due, o);
        // Handled now, awaited in turn: a batch that fails while another is awaited must not end the process.
        run.catch(() => undefined);
        running.push(run);
        started.push(run);
      }
      const last = !due.length || due.length < batch || Date.now() - start >= (o.budgetMs ?? BUDGET_MS);
      while (running.length && (last || running.length >= s.depth)) total += await running.shift()!;
      if (last) return total;
    }
  } finally {
    await Promise.allSettled(started);
  }
}
