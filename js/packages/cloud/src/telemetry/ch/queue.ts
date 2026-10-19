// Traces waiting for their stats. One cloud process writes telemetry, so the queue lives in memory; a restart rebuilds it from ClickHouse.
import type { ChClient } from "./http.js";

export interface Dirty {
  project: string;
  traceId: string;
  env: string;
  /** The newest write. */
  updatedMs: number;
  /** When it last settled; 0 when never. */
  settledMs: number;
}

const QUIET_MS = 5_000;
const BUSY_MS = 30_000;
const RECOVER_MS = 6 * 3_600_000;

export class SettleQueue {
  private readonly items = new Map<string, Dirty>();
  /** Keys a settle batch holds, so an overlapping batch skips them. */
  private readonly busy = new Set<string>();

  /** A trace got new parts. */
  touch(project: string, traceId: string, env: string, now: number): void {
    const k = `${project} ${traceId}`;
    const it = this.items.get(k);
    if (it) (it.updatedMs = now), (it.env ||= env);
    else this.items.set(k, { project, traceId, env, updatedMs: now, settledMs: 0 });
  }

  /** Traces quiet for a while, or busy ones not settled for long: newest first. */
  due(now: number, limit: number): Dirty[] {
    const ready = [...this.items.entries()].filter(([k, d]) => !this.busy.has(k) && d.settledMs < d.updatedMs && (d.updatedMs <= now - QUIET_MS || d.settledMs <= now - BUSY_MS));
    return ready.map(([, d]) => d).sort((a, b) => b.updatedMs - a.updatedMs).slice(0, limit);
  }

  /** Due traces for one batch, held until settled or released. Copies, so a write that lands meanwhile keeps its trace dirty. */
  take(now: number, limit: number): Dirty[] {
    const out = this.due(now, limit).map((d) => ({ ...d }));
    for (const d of out) this.busy.add(`${d.project} ${d.traceId}`);
    return out;
  }

  /** A failed batch: its traces wait for the next run. */
  release(items: readonly Dirty[]): void {
    for (const d of items) this.busy.delete(`${d.project} ${d.traceId}`);
  }

  /** Settled as of `updatedMs`: done unless something newer came in since. */
  settled(d: Dirty, updatedMs: number): void {
    const k = `${d.project} ${d.traceId}`;
    this.busy.delete(k);
    const it = this.items.get(k);
    if (!it) return;
    if (it.updatedMs <= updatedMs) this.items.delete(k);
    else it.settledMs = updatedMs;
  }

  /** How many traces of a project (optionally one environment, last written at or before `before`) still wait. */
  count(project: string, env?: string, before = Infinity): number {
    let n = 0;
    for (const d of this.items.values()) if (d.project === project && (!env || d.env === env) && d.updatedMs <= before) n++;
    return n;
  }

  clear(project?: string): void {
    for (const [k, d] of this.items) if (!project || d.project === project) (this.items.delete(k), this.busy.delete(k));
  }

  get size(): number {
    return this.items.size;
  }

  /** On start: traces written lately that never settled (or changed after), from the update log. */
  async recover(ch: ChClient, now: number): Promise<number> {
    const rows = await ch.query<{ project_id: string; trace_id: string; env: string; u: number; s: number }>(
      `SELECT u.project_id, u.trace_id, any(u.env) AS env, max(u.updated_ms) AS u, any(s.settled_ms) AS s FROM trace_updates u
       LEFT JOIN (SELECT project_id, trace_id, settled_ms FROM settle_state FINAL) s ON s.project_id = u.project_id AND s.trace_id = u.trace_id
       WHERE u.updated_ms > {p1:Float64} GROUP BY u.project_id, u.trace_id HAVING u > s`,
      [now - RECOVER_MS],
    );
    for (const r of rows) this.items.set(`${r.project_id} ${r.trace_id}`, { project: r.project_id, traceId: r.trace_id, env: r.env, updatedMs: r.u, settledMs: r.s });
    return rows.length;
  }

  /** Every trace (after the facts version changed): its stats are rebuilt from scratch. */
  async requeueAll(ch: ChClient): Promise<number> {
    const rows = await ch.query<{ project_id: string; trace_id: string; env: string; u: number }>(
      "SELECT project_id, trace_id, max(env) AS env, max(updated_ms) AS u FROM trace_heads GROUP BY project_id, trace_id",
    );
    for (const r of rows) this.items.set(`${r.project_id} ${r.trace_id}`, { project: r.project_id, traceId: r.trace_id, env: r.env, updatedMs: r.u, settledMs: 0 });
    return rows.length;
  }
}
