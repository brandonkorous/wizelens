import { buildTrace, HUB_ONLINE_MS, type HubSender, type HubService, type LogRecord, LOOSE_TRACE_PREFIX, type Span, type Trace } from "@wizeworks/lens-core/internal";
import type { Queryable } from "../db/db.js";

import type { TenantScope, TraceQuery } from "../telemetry/store.js";

export type { TraceQuery };

const CHUNK = 500;

/** Newest trace ids of the scope; a trace in several projects once. */
export async function findTraceIds(q: Queryable, t: TraceQuery): Promise<string[]> {
  const where = ["org_id = $1", "project_id = ANY($2)"];
  const args: unknown[] = [t.scope.org, [...t.scope.projects]];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (t.since !== undefined) add("updated_ms >= ?", t.since);
  if (t.before !== undefined) add("start_ms < ?", t.before);
  if (t.from !== undefined) add("start_ms >= ?", t.from);
  if (t.env) add("env = ?", t.env);
  if (t.session) add("trace_id IN (SELECT trace_id FROM spans WHERE org_id = $1 AND project_id = ANY($2) AND session = ?)", t.session);
  if (t.noLoose) add("substr(trace_id, 1, 16) <> ?", LOOSE_TRACE_PREFIX);
  args.push(t.limit);
  const sql = `SELECT trace_id, max(start_ms) AS s FROM traces WHERE ${where.join(" AND ")} GROUP BY trace_id ORDER BY s DESC LIMIT $${args.length}`;
  const rows = await q.query<{ trace_id: string }>(sql, args);
  return rows.map((r) => r.trace_id);
}

/** Rows of one organization's projects. Reads take a TenantScope; settling passes its own rows' owners, '' for a project that is gone. */
type Owned = Pick<TenantScope, "org" | "projects">;

async function jsonByTrace(q: Queryable, table: "spans" | "logs", s: Owned, ids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const sql = `SELECT trace_id, json FROM ${table} WHERE org_id = $1 AND project_id = ANY($2) AND trace_id = ANY($3)`;
    const rows = await q.query<{ trace_id: string; json: string }>(sql, [s.org, [...s.projects], part]);
    for (const r of rows) {
      const list = out.get(r.trace_id);
      if (list) list.push(r.json);
      else out.set(r.trace_id, [r.json]);
    }
  }
  return out;
}

/** Full traces, in the order of `ids`. Spans that two projects both sent count once. */
export const loadTraces = (q: Queryable, scope: TenantScope, ids: readonly string[]): Promise<Trace[]> => loadOwned(q, scope, ids);

/** For settling only: one project's traces under the organization its rows carry. */
export const loadSettling = (q: Queryable, org: string, projectId: string, ids: readonly string[]): Promise<Trace[]> => loadOwned(q, { org, projects: [projectId] }, ids);

async function loadOwned(q: Queryable, scope: Owned, ids: readonly string[]): Promise<Trace[]> {
  if (ids.length === 0) return [];
  const spans = await jsonByTrace(q, "spans", scope, ids);
  const logs = await jsonByTrace(q, "logs", scope, ids);
  return ids.map((id) => {
    const seen = new Set<string>();
    const s = (spans.get(id) ?? []).map((j) => JSON.parse(j) as Span).filter((x) => !seen.has(x.spanId) && seen.add(x.spanId));
    const l = (logs.get(id) ?? []).map((j) => JSON.parse(j) as LogRecord).sort((a, b) => a.timeMs - b.timeMs);
    return buildTrace(id, s, l, []);
  });
}

export const queryTraces = async (q: Queryable, t: TraceQuery): Promise<Trace[]> => loadTraces(q, t.scope, await findTraceIds(q, t));

export async function getTrace(q: Queryable, scope: TenantScope, traceId: string): Promise<Trace | undefined> {
  const [trace] = await loadTraces(q, scope, [traceId]);
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

/** Environments seen on the scope's traces (Postgres store). */
export async function traceEnvsPg(q: Queryable, s: TenantScope): Promise<string[]> {
  return (await q.query<{ e: string }>("SELECT DISTINCT env AS e FROM traces WHERE org_id = $1 AND project_id = ANY($2)", [s.org, [...s.projects]])).map((r) => r.e);
}

export async function countRows(q: Queryable, s: TenantScope): Promise<{ traces: number; spans: number }> {
  const sql = (table: string, what: string) => `SELECT count(${what})::int AS n FROM ${table} WHERE org_id = $1 AND project_id = ANY($2)`;
  const n = async (table: string, what: string) => (await q.query<{ n: number }>(sql(table, what), [s.org, [...s.projects]]))[0]?.n ?? 0;
  // A trace in two projects counts once, as on ClickHouse.
  return { traces: await n("traces", "DISTINCT trace_id"), spans: await n("spans", "*") };
}
