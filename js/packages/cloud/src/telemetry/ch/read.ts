// Trace reads on ClickHouse: lists from the bounds table, whole traces from the raw spans and logs.
import { buildTrace, type LogRecord, type Span, type Trace } from "@wizeworks/lens-core";
import type { TraceQuery } from "../store.js";
import type { ChClient } from "./http.js";

const CHUNK = 500;
/** Lists look back this far first, and further only when they find too few traces. */
const LOOKBACKS_MS = [3_600_000, 86_400_000, 7 * 86_400_000, Number.POSITIVE_INFINITY];

/** Trace ids, newest start first, for one lookback. Row filters narrow before grouping; HAVING checks the merged bounds. */
async function idsWithin(ch: ChClient, t: TraceQuery, now: number, backMs: number): Promise<string[]> {
  const params: unknown[] = [t.projectId];
  const p = (v: unknown, type: string) => (params.push(v), `{p${params.length}:${type}}`);
  const rows = ["project_id = {p1:String}"];
  if (Number.isFinite(backMs)) rows.push(`start_ms >= ${p(now - backMs, "Float64")}`);
  if (t.since !== undefined) rows.push(`updated_ms >= ${p(t.since, "Float64")}`);
  if (t.before !== undefined) rows.push(`start_ms < ${p(t.before, "Float64")}`);
  if (t.session) rows.push(`trace_id IN (SELECT trace_id FROM spans_raw WHERE project_id = {p1:String} AND session = ${p(t.session, "String")})`);
  const having = ["1"];
  if (t.from !== undefined) having.push(`s >= ${p(t.from, "Float64")}`);
  if (t.before !== undefined) having.push(`s < ${p(t.before, "Float64")}`);
  if (t.env) having.push(`e = ${p(t.env, "String")}`);
  const sql = `SELECT trace_id, min(start_ms) AS s, max(env) AS e FROM trace_heads WHERE ${rows.join(" AND ")} GROUP BY trace_id
    HAVING ${having.join(" AND ")} ORDER BY s DESC, trace_id LIMIT ${Math.max(1, Math.floor(t.limit))}`;
  return (await ch.query<{ trace_id: string }>(sql, params)).map((r) => r.trace_id);
}

/** Newest traces that match, widening the lookback until enough are found. */
export async function findTraceIds(ch: ChClient, t: TraceQuery, now: number): Promise<string[]> {
  for (const back of LOOKBACKS_MS) {
    const ids = await idsWithin(ch, t, now, back);
    if (ids.length >= t.limit || !Number.isFinite(back)) return ids;
  }
  return [];
}

async function jsonOf(ch: ChClient, table: "spans_raw" | "logs_raw", projects: readonly string[], ids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const sql = `SELECT trace_id, json FROM ${table} FINAL WHERE has({p1:Array(String)}, project_id) AND has({p2:Array(String)}, trace_id)`;
    for (const r of await ch.query<{ trace_id: string; json: string }>(sql, [projects, ids.slice(i, i + CHUNK)])) out.set(r.trace_id, [...(out.get(r.trace_id) ?? []), r.json]);
  }
  return out;
}

/** Whole traces of some projects, in the order of `ids`. Spans that two projects both sent count once. */
export async function loadTraces(ch: ChClient, projects: readonly string[], ids: readonly string[]): Promise<Trace[]> {
  if (ids.length === 0) return [];
  const [spans, logs] = await Promise.all([jsonOf(ch, "spans_raw", projects, ids), jsonOf(ch, "logs_raw", projects, ids)]);
  return ids.map((id) => {
    const seen = new Set<string>();
    const s = (spans.get(id) ?? []).map((j) => JSON.parse(j) as Span).filter((x) => !seen.has(x.spanId) && seen.add(x.spanId));
    const l = (logs.get(id) ?? []).map((j) => JSON.parse(j) as LogRecord).sort((a, b) => a.timeMs - b.timeMs);
    return buildTrace(id, s, l, []);
  });
}

/** One trace, or undefined when nothing of it is stored. */
export async function getTrace(ch: ChClient, projects: readonly string[], traceId: string): Promise<Trace | undefined> {
  const [t] = await loadTraces(ch, projects, [traceId]);
  return t && t.spanCount + t.logs.length > 0 ? t : undefined;
}

/** The primary project's trace joined with its parts from `scope`; undefined when the primary project has none. */
export async function joinedTrace(ch: ChClient, primaryId: string, scope: readonly string[], traceId: string): Promise<Trace | undefined> {
  const own = await getTrace(ch, [primaryId], traceId);
  if (!own || scope.every((id) => id === primaryId)) return own;
  return getTrace(ch, [...new Set([primaryId, ...scope])], traceId);
}
