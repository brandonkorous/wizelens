import { buildTrace, type LogRecord, type Span, type Trace } from "@wizeworks/lens-core";
import type { Queryable } from "../db/db.js";
import { getTrace } from "./trace-read.js";

/** Every project of one organization. */
export async function orgProjectIds(q: Queryable, orgId: string): Promise<string[]> {
  const rows = await q.query<{ id: string }>("SELECT id FROM projects WHERE org_id = $1", [orgId]);
  return rows.map((r) => r.id);
}

/** The projects of `ids` that belong to `orgId`. Anything outside the organization is dropped. */
export async function inOrg(q: Queryable, orgId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await q.query<{ id: string }>("SELECT id FROM projects WHERE org_id = $1 AND id = ANY($2)", [orgId, [...ids]]);
  return rows.map((r) => r.id);
}

async function partsOf(q: Queryable, projectIds: readonly string[], traceId: string): Promise<{ spans: Span[]; logs: LogRecord[] }> {
  const ids = [...projectIds];
  const spans = await q.query<{ json: string }>("SELECT json FROM spans WHERE project_id = ANY($1) AND trace_id = $2", [ids, traceId]);
  const logs = await q.query<{ json: string }>("SELECT json FROM logs WHERE project_id = ANY($1) AND trace_id = $2", [ids, traceId]);
  return { spans: spans.map((r) => JSON.parse(r.json) as Span), logs: logs.map((r) => JSON.parse(r.json) as LogRecord) };
}

/** One trace with its parts from the projects in `scope` (already checked: same organization, readable by the caller). Undefined when the primary project has no part. */
export async function getJoinedTrace(q: Queryable, primaryId: string, scope: readonly string[], traceId: string): Promise<Trace | undefined> {
  const own = await getTrace(q, primaryId, traceId);
  const others = scope.filter((id) => id !== primaryId);
  if (!own || others.length === 0) return own;
  const extra = await partsOf(q, others, traceId);
  if (extra.spans.length + extra.logs.length === 0) return own;
  const seen = new Set(own.spans.map((s) => s.spanId));
  const spans = [...own.spans, ...extra.spans.filter((s) => !seen.has(s.spanId) && seen.add(s.spanId))];
  const logs = [...own.logs, ...extra.logs].sort((a, b) => a.timeMs - b.timeMs);
  return buildTrace(traceId, spans, logs, []);
}
