import { buildTrace, HUB_ONLINE_MS, type HubSender, type HubService, type LogRecord, type Span, type Trace } from "@wizeworks/lens-core";
import type { Queryable } from "../db/db.js";

import type { TraceQuery } from "../telemetry/store.js";

export type { TraceQuery };

const CHUNK = 500;

export async function findTraceIds(q: Queryable, t: TraceQuery): Promise<string[]> {
  const where = ["project_id = $1"];
  const args: unknown[] = [t.projectId];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (t.since !== undefined) add("updated_ms >= ?", t.since);
  if (t.before !== undefined) add("start_ms < ?", t.before);
  if (t.from !== undefined) add("start_ms >= ?", t.from);
  if (t.env) add("env = ?", t.env);
  if (t.session) add("trace_id IN (SELECT trace_id FROM spans WHERE project_id = $1 AND session = ?)", t.session);
  args.push(t.limit);
  const rows = await q.query<{ trace_id: string }>(`SELECT trace_id FROM traces WHERE ${where.join(" AND ")} ORDER BY start_ms DESC LIMIT $${args.length}`, args);
  return rows.map((r) => r.trace_id);
}

async function jsonByTrace(q: Queryable, table: "spans" | "logs", projectId: string, ids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const rows = await q.query<{ trace_id: string; json: string }>(`SELECT trace_id, json FROM ${table} WHERE project_id = $1 AND trace_id = ANY($2)`, [
      projectId,
      part,
    ]);
    for (const r of rows) {
      const list = out.get(r.trace_id);
      if (list) list.push(r.json);
      else out.set(r.trace_id, [r.json]);
    }
  }
  return out;
}

/** Full traces, in the order of `ids`. */
export async function loadTraces(q: Queryable, projectId: string, ids: readonly string[]): Promise<Trace[]> {
  if (ids.length === 0) return [];
  const spans = await jsonByTrace(q, "spans", projectId, ids);
  const logs = await jsonByTrace(q, "logs", projectId, ids);
  return ids.map((id) => {
    const s = (spans.get(id) ?? []).map((j) => JSON.parse(j) as Span);
    const l = (logs.get(id) ?? []).map((j) => JSON.parse(j) as LogRecord).sort((a, b) => a.timeMs - b.timeMs);
    return buildTrace(id, s, l, []);
  });
}

export const queryTraces = async (q: Queryable, t: TraceQuery): Promise<Trace[]> => loadTraces(q, t.projectId, await findTraceIds(q, t));

export async function getTrace(q: Queryable, projectId: string, traceId: string): Promise<Trace | undefined> {
  const [trace] = await loadTraces(q, projectId, [traceId]);
  return trace && trace.spanCount + trace.logs.length > 0 ? trace : undefined;
}

/** How many traces started in [from, to). */
export async function countTraces(q: Queryable, projectId: string, from: number, to: number, env?: string): Promise<number> {
  const [row] = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM traces WHERE project_id = $1 AND start_ms >= $2 AND start_ms < $3 AND ($4::text = '' OR env = $4::text)`,
    [projectId, from, to, env ?? ""],
  );
  return row?.n ?? 0;
}

interface ServiceRow {
  via: "addon" | "otlp";
  info: string;
  first_seen: number;
  last_seen: number;
}

export async function listServices(q: Queryable, projectId: string, now: number): Promise<HubService[]> {
  const rows = await q.query<ServiceRow>("SELECT via, info, first_seen, last_seen FROM services WHERE project_id = $1 ORDER BY last_seen DESC", [projectId]);
  return rows.map((r) => ({ ...(JSON.parse(r.info) as HubSender), via: r.via, firstSeenMs: r.first_seen, lastSeenMs: r.last_seen, online: now - r.last_seen <= HUB_ONLINE_MS }));
}

/** Environments of the project's services, plus those seen on traces (from the telemetry store). */
export async function environmentsOf(q: Queryable, projectId: string, traceEnvs: readonly string[]): Promise<string[]> {
  const rows = await q.query<{ e: string }>("SELECT DISTINCT environment AS e FROM services WHERE project_id = $1", [projectId]);
  return [...new Set([...rows.map((r) => r.e), ...traceEnvs])].filter(Boolean).sort();
}

/** Environments seen on a project's traces (Postgres store). */
export async function traceEnvsPg(q: Queryable, projectId: string): Promise<string[]> {
  return (await q.query<{ e: string }>("SELECT DISTINCT env AS e FROM traces WHERE project_id = $1", [projectId])).map((r) => r.e);
}

export async function countRows(q: Queryable, projectId: string): Promise<{ traces: number; spans: number }> {
  const n = async (table: string) => (await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE project_id = $1`, [projectId]))[0]?.n ?? 0;
  return { traces: await n("traces"), spans: await n("spans") };
}
