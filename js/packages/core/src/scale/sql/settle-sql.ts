// What both hosts write when traces settle, when they leave, and when rollup tiers age out.
import type { Trace } from "../../types.js";
import { compact, type StoredContributions, withoutTop } from "../compact.js";
import { mergeDeltas, type SettleDelta, settleDelta } from "../delta.js";
import { type FactOptions, FACTS_VERSION, traceFacts } from "../facts.js";
import { tierCutoff, TIERS } from "../window.js";
import { type Dialect, lit, paramOf, type Statement } from "./dialect.js";
import { deltaStatements, factDeletes, factInserts, factRows, FACT_TABLES, type FactTable } from "./write-sql.js";

/** A trace row that needs settling or pruning. */
export interface TraceState {
  traceId: string;
  project: string;
  env: string;
  /** Its updated_ms when read; it becomes settled_ms, so a later write settles it again. */
  updatedMs: number;
  /** The stored contributions it added before, as JSON. */
  contrib: string | null;
  /** How long the 1 h tier keeps buckets for its project. */
  retentionMs: number;
  /** How long the 1 h tier keeps log buckets for its project; the trace retention when absent. */
  logRetentionMs?: number;
  /** The project's thresholds; the defaults when missing. */
  facts?: Partial<FactOptions>;
}

/** Stored contributions from a trace row, or null when missing, broken, or of another facts version. */
export function storedOf(contrib: string | null | undefined): StoredContributions | null {
  if (!contrib) return null;
  try {
    const s = JSON.parse(contrib) as StoredContributions;
    return s && s.v === FACTS_VERSION && Array.isArray(s.rows) ? s : null;
  } catch {
    return null;
  }
}

/** Fact deletes per project on the cloud (scoped), or by id alone on the hub. */
function deletesOf(d: Dialect, states: readonly TraceState[], scoped: boolean): Statement[] {
  if (!scoped) return factDeletes(d, null, states.map((s) => s.traceId));
  const byProject = new Map<string, string[]>();
  for (const s of states) byProject.set(s.project, [...(byProject.get(s.project) ?? []), s.traceId]);
  return [...byProject].flatMap(([project, ids]) => factDeletes(d, project, ids));
}

function traceUpdate(d: Dialect, s: TraceState, contrib: string | null, scoped: boolean): Statement {
  const params = [contrib, s.updatedMs, ...(scoped ? [s.project] : []), s.traceId].map((v) => paramOf(d, v));
  if (d.name === "sqlite") return { sql: `UPDATE traces SET contrib = ?, settled_ms = ? WHERE ${scoped ? `${d.project} = ? AND ` : ""}trace_id = ?`, params };
  return { sql: `UPDATE traces SET contrib = $1, settled_ms = $2 WHERE ${scoped ? `${d.project} = $3 AND trace_id = $4` : "trace_id = $3"}`, params };
}

/** A trace with nothing left in it settles to no facts. */
const hasData = (t: Trace | null | undefined): t is Trace => !!t && t.spanCount + t.logs.length > 0;

/** Writes that settle a batch: replace the facts, add new minus old contributions, and mark the rows settled. */
export function settleStatements(d: Dialect, batch: readonly { state: TraceState; trace: Trace | null | undefined }[], now: number, scoped: boolean): Statement[] {
  const deltas: SettleDelta[] = [];
  const rows = Object.fromEntries(FACT_TABLES.map((t) => [t, [] as unknown[][]])) as Record<FactTable, unknown[][]>;
  const updates: Statement[] = [];
  for (const { state, trace } of batch) {
    const scope = { project: state.project, env: state.env };
    const facts = hasData(trace) ? traceFacts(trace, state.facts) : null;
    const next = facts ? compact(facts, scope) : null;
    deltas.push(settleDelta(storedOf(state.contrib), next, now, state.retentionMs, state.logRetentionMs));
    if (facts) {
      const r = factRows(facts, scope, trace ?? undefined);
      for (const t of FACT_TABLES) rows[t].push(...r[t]);
    }
    updates.push(traceUpdate(d, state, next ? JSON.stringify(withoutTop(next)) : null, scoped));
  }
  return [...deletesOf(d, batch.map((b) => b.state), scoped), ...factInserts(d, rows), ...deltaStatements(d, mergeDeltas(deltas)), ...updates];
}

/** Writes for traces about to be deleted: take their contributions out of the rollups and drop their facts. */
export function pruneStatements(d: Dialect, doomed: readonly TraceState[], now: number, scoped: boolean): Statement[] {
  const delta = mergeDeltas(doomed.map((s) => settleDelta(storedOf(s.contrib), null, now, s.retentionMs, s.logRetentionMs)));
  return [...deltaStatements(d, delta), ...deletesOf(d, doomed, scoped)];
}

/** Drop 10 s and 5 min buckets past their keep time; with `empties`, also rows that subtraction emptied. The 1 h tier is the host's (retention). */
export function tierPruneStatements(now: number, empties: boolean): Statement[] {
  const out: Statement[] = [];
  for (const t of TIERS) {
    if (t.keepMs !== null) for (const table of [t.table, t.hist]) out.push({ sql: `DELETE FROM ${table} WHERE bucket_ms <= ${lit(tierCutoff(t, now, t.keepMs!))}`, params: [] });
    if (empties) out.push({ sql: `DELETE FROM ${t.table} WHERE n <= 0.5`, params: [] }, { sql: `DELETE FROM ${t.hist} WHERE cnt <= 0.5`, params: [] });
  }
  return out;
}
