// Settling on ClickHouse: the same facts and deltas as Postgres, written as inserts. One process settles, so no lock is needed.
import { compact, factRows, FACT_TABLES, type FactTable, mergeDeltas, type SettleDelta, settleDelta, storedOf, type Trace, traceFacts, withoutTop } from "@wizeworks/lens-core";
import type { SettleOptions } from "../store.js";
import type { ChClient } from "./http.js";
import type { Dirty, SettleQueue } from "./queue.js";
import { loadTraces } from "./read.js";
import { factObjects, tombstones, writeDeltas } from "./settle-rows.js";
import { byProject, nextVer, type RetentionCache } from "./util.js";

const BATCH = 500;
const BUDGET_MS = 2_000;

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

/** Write one project's work: tombstones first, then live rows, rollups, and the settle states. */
async function writeWork(ch: ChClient, project: string, w: ProjectWork, ver: number, retentionMs: number): Promise<void> {
  const dead = await tombstones(ch, project, w.resettled, w.facts, ver);
  for (const t of FACT_TABLES) await ch.insert(`${t}_t`, [...dead[t], ...w.facts[t]]);
  await writeDeltas(ch, mergeDeltas(w.deltas), () => retentionMs);
  await ch.insert("settle_state", w.states);
}

/** Settle one batch of due traces. Returns how many. */
async function settleBatch(ch: ChClient, queue: SettleQueue, retention: RetentionCache, now: number, batch: number): Promise<number> {
  const due = queue.due(now, batch);
  if (!due.length) return 0;
  const days = await retention.daysOf(due.map((d) => d.project));
  for (const [project, items] of byProject(due)) {
    const retentionMs = days.get(project)! * 86_400_000;
    const ver = nextVer(now);
    await writeWork(ch, project, await projectWork(ch, project, items, now, retentionMs, ver), ver, retentionMs);
    for (const d of items) queue.settled(d, d.updatedMs);
  }
  return due.length;
}

/** Settle due traces in batches until none are left or the budget is spent. */
export async function settleClickHouse(ch: ChClient, queue: SettleQueue, retention: RetentionCache, now: number, o: SettleOptions = {}): Promise<number> {
  const start = Date.now();
  const batch = o.batch ?? BATCH;
  let total = 0;
  for (;;) {
    const n = await settleBatch(ch, queue, retention, now, batch);
    total += n;
    if (n < batch || Date.now() - start >= (o.budgetMs ?? BUDGET_MS)) return total;
  }
}
