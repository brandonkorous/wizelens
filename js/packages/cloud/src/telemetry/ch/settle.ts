// Settling on ClickHouse: the same facts and deltas as Postgres, written as inserts. One process settles, so no lock is needed.
import { compact, factRows, FACT_TABLES, type FactTable, mergeDeltas, type SettleDelta, settleDelta, storedOf, type Trace, traceFacts, withoutTop } from "@wizeworks/lens-core";
import type { SettleOptions } from "../store.js";
import type { ChClient } from "./http.js";
import type { Dirty, SettleQueue } from "./queue.js";
import { loadTraces } from "./read.js";
import { factObjects, type Label, tombstones, writeDeltas } from "./settle-rows.js";
import { byProject, nextVer, type RetentionCache } from "./util.js";

const BATCH = 2_000;
const BUDGET_MS = 2_000;
const DEPTH = 3;

type Row = Record<string, unknown>;

const hasData = (t: Trace | undefined): t is Trace => !!t && t.spanCount + t.logs.length > 0;

/** Stored contributions of some traces, by trace id. */
async function storedContribs(ch: ChClient, project: string, ids: readonly string[]): Promise<Map<string, string>> {
  const rows = await ch.query<{ trace_id: string; contrib: string }>(
    "SELECT trace_id, contrib FROM settle_state FINAL WHERE project_id = {p1:String} AND has({p2:Array(String)}, trace_id)",
    [project, ids],
  );
  return new Map(rows.map((r) => [r.trace_id, r.contrib]));
}

interface ProjectWork {
  facts: Record<FactTable, Row[]>;
  deltas: SettleDelta[];
  states: Row[];
  resettled: string[];
}

/** Facts, deltas, and new settle states for one project's dirty traces. */
async function projectWork(ch: ChClient, project: string, items: readonly Dirty[], now: number, retentionMs: number, ver: number): Promise<ProjectWork> {
  const ids = items.map((d) => d.traceId);
  const [traces, stored] = await Promise.all([loadTraces(ch, [project], ids), storedContribs(ch, project, ids)]);
  const raw = Object.fromEntries(FACT_TABLES.map((t) => [t, [] as unknown[][]])) as Record<FactTable, unknown[][]>;
  const work: ProjectWork = { facts: {} as Record<FactTable, Row[]>, deltas: [], states: [], resettled: [] };
  items.forEach((d, i) => {
    const trace = traces[i];
    const scope = { project, env: d.env };
    const facts = hasData(trace) ? traceFacts(trace) : null;
    const next = facts ? compact(facts, scope) : null;
    const old = stored.get(d.traceId);
    if (old !== undefined) work.resettled.push(d.traceId);
    work.deltas.push(settleDelta(storedOf(old || null), next, now, retentionMs));
    if (facts) for (const [t, rows] of Object.entries(factRows(facts, scope, trace)) as [FactTable, unknown[][]][]) raw[t].push(...rows);
    const start = trace?.startMs ?? now;
    work.states.push({ project_id: project, trace_id: d.traceId, settled_ms: d.updatedMs, contrib: next ? JSON.stringify(withoutTop(next)) : "", ver, expire_ms: start + retentionMs });
  });
  const timeOf = (r: Row) => Number(r.start_ms ?? r.time_ms ?? now);
  work.facts = factObjects(raw, ver, (r) => timeOf(r) + retentionMs);
  return work;
}

/** Write one project's work: facts (with tombstones) and rollups at once, then the settle states, so a failed write settles again. */
async function writeWork(ch: ChClient, project: string, w: ProjectWork, ver: number, retentionMs: number, label: Label): Promise<void> {
  const dead = await tombstones(ch, project, w.resettled, w.facts, ver);
  const facts = FACT_TABLES.map((t) => ch.insert(`${t}_t`, [...dead[t], ...w.facts[t]], label(t)));
  await Promise.all([...facts, writeDeltas(ch, mergeDeltas(w.deltas), () => retentionMs, label)]);
  await ch.insert("settle_state", w.states, label("settle_state"));
}

/** Settle one batch of taken traces. A failure releases the ones not written yet. */
async function settleItems(ch: ChClient, queue: SettleQueue, retention: RetentionCache, now: number, due: readonly Dirty[], o: SettleOptions): Promise<number> {
  let left = [...due];
  try {
    const days = await retention.daysOf(due.map((d) => d.project));
    for (const [project, items] of byProject(due)) {
      const retentionMs = days.get(project)! * 86_400_000;
      const ver = nextVer(now);
      const label: Label = (table) => ({ insert_deduplication_token: `${ver}:${project}:${table}` });
      await writeWork(ch, project, await projectWork(ch, project, items, now, retentionMs, ver), ver, retentionMs, label);
      for (const d of items) queue.settled(d, d.updatedMs);
      left = left.filter((d) => d.project !== project);
      o.onSettled?.(project);
    }
    return due.length;
  } finally {
    queue.release(left);
  }
}

/** Settle due traces until none are left or the budget is spent. Batches overlap (`DEPTH` at once): one reads and computes while others wait on their writes. */
export async function settleClickHouse(ch: ChClient, queue: SettleQueue, retention: RetentionCache, now: number, o: SettleOptions = {}): Promise<number> {
  const start = Date.now();
  const batch = o.batch ?? BATCH;
  const running: Promise<number>[] = [];
  const started: Promise<number>[] = [];
  let total = 0;
  try {
    for (;;) {
      const due = queue.take(now, batch);
      if (due.length) {
        const run = settleItems(ch, queue, retention, now, due, o);
        // Handled now, awaited in turn: a batch that fails while another is awaited must not end the process.
        run.catch(() => undefined);
        running.push(run);
        started.push(run);
      }
      const last = !due.length || due.length < batch || Date.now() - start >= (o.budgetMs ?? BUDGET_MS);
      while (running.length && (last || running.length >= DEPTH)) total += await running.shift()!;
      if (last) return total;
    }
  } finally {
    await Promise.allSettled(started);
  }
}
