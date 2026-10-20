// The heavy part of a settle batch for one project: read its traces, build facts and deltas, and write them. Runs in a worker thread or in the main thread.
import { compact, type FactOptions, factRows, FACT_TABLES, type FactTable, isLooseTraceId, mergeDeltas, type SettleDelta, settleDelta, storedOf, type Trace, traceFacts, withoutTop } from "@wizeworks/lens-core";
import type { ChClient } from "./http.js";
import type { Dirty } from "./queue.js";
import { loadTraces } from "./read.js";
import { factKeepOf, factObjects, type Label, tombstones, writeDeltas } from "./settle-rows.js";

type Row = Record<string, unknown>;

/** One project's part of a batch. Plain data, so it can go to a worker thread. */
export interface ProjectTask {
  project: string;
  items: Dirty[];
  now: number;
  retentionMs: number;
  /** How long log rows are kept for this project. */
  logRetentionMs: number;
  /** The project's thresholds. */
  facts?: Partial<FactOptions>;
  /** The row version, from the main thread, so versions only grow. */
  ver: number;
}

/** Settles one project's part of a batch. Resolves once every row is written. */
export type ProjectRunner = (task: ProjectTask) => Promise<void>;

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
async function projectWork(ch: ChClient, t: ProjectTask): Promise<ProjectWork> {
  const { project, items, now, retentionMs, logRetentionMs, ver } = t;
  const keep = { ms: retentionMs, logMs: logRetentionMs };
  const ids = items.map((d) => d.traceId);
  const [traces, stored] = await Promise.all([loadTraces(ch, [project], ids), storedContribs(ch, project, ids)]);
  const raw = Object.fromEntries(FACT_TABLES.map((t) => [t, [] as unknown[][]])) as Record<FactTable, unknown[][]>;
  const work: ProjectWork = { facts: {} as Record<FactTable, Row[]>, deltas: [], states: [], resettled: [] };
  items.forEach((d, i) => {
    const trace = traces[i];
    const scope = { project, env: d.env };
    const facts = hasData(trace) ? traceFacts(trace, t.facts) : null;
    const next = facts ? compact(facts, scope) : null;
    const old = stored.get(d.traceId);
    if (old !== undefined) work.resettled.push(d.traceId);
    work.deltas.push(settleDelta(storedOf(old || null), next, now, retentionMs, logRetentionMs));
    if (facts) for (const [t, rows] of Object.entries(factRows(facts, scope, trace)) as [FactTable, unknown[][]][]) raw[t].push(...rows);
    const start = trace?.startMs ?? now;
    const stateKeep = isLooseTraceId(d.traceId) ? logRetentionMs : retentionMs;
    work.states.push({ project_id: project, trace_id: d.traceId, settled_ms: d.updatedMs, contrib: next ? JSON.stringify(withoutTop(next)) : "", ver, expire_ms: start + stateKeep });
  });
  const timeOf = (r: Row) => Number(r.start_ms ?? r.time_ms ?? now);
  work.facts = factObjects(raw, ver, (r, table) => timeOf(r) + factKeepOf(table, r, keep));
  return work;
}

/** Write one project's work: facts (with tombstones) and rollups at once, then the settle states, so a failed write settles again. */
async function writeWork(ch: ChClient, t: ProjectTask, w: ProjectWork): Promise<void> {
  // The same token on a retry lets ClickHouse keep one copy.
  const label: Label = (table) => ({ insert_deduplication_token: `${t.ver}:${t.project}:${table}` });
  const dead = await tombstones(ch, t.project, w.resettled, w.facts, t.ver);
  const facts = FACT_TABLES.map((f) => ch.insert(`${f}_t`, [...dead[f], ...w.facts[f]], label(f)));
  await Promise.all([...facts, writeDeltas(ch, mergeDeltas(w.deltas), () => ({ ms: t.retentionMs, logMs: t.logRetentionMs }), label)]);
  await ch.insert("settle_state", w.states, label("settle_state"));
}

/** Settle one project's part of a batch. */
export async function settleProject(ch: ChClient, t: ProjectTask): Promise<void> {
  await writeWork(ch, t, await projectWork(ch, t));
}
