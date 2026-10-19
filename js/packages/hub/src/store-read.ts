import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { buildTrace, HUB_ONLINE_MS, LOOSE_TRACE_PREFIX, type HubSender, type HubService, type LogRecord, type Span, type Trace } from "@wizeworks/lens-core";

export interface TraceQuery {
  /** Only traces that changed at or after this time (epoch ms, hub clock). */
  since?: number;
  /** Only traces that started before this time. For paging back. */
  before?: number;
  env?: string;
  project?: string;
  /** Only traces with a browser span from this tab. */
  session?: string;
  /** Leave out loose batches (lines outside a request), which are not traces to list. */
  noLoose?: boolean;
  limit: number;
}

const CHUNK = 400;

/** Trace ids that match, newest first. */
export function findTraceIds(db: DatabaseSync, q: TraceQuery): string[] {
  const where: string[] = [];
  const args: SQLInputValue[] = [];
  const add = (sql: string, v: SQLInputValue) => (where.push(sql), args.push(v));
  if (q.since !== undefined) add("updated_ms >= ?", q.since);
  if (q.before !== undefined) add("start_ms < ?", q.before);
  if (q.env) add("env = ?", q.env);
  if (q.project) add("project = ?", q.project);
  if (q.session) add("trace_id IN (SELECT trace_id FROM spans WHERE session = ?)", q.session);
  if (q.noLoose) add("substr(trace_id, 1, 16) <> ?", LOOSE_TRACE_PREFIX);
  const sql = `SELECT trace_id FROM traces ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY start_ms DESC LIMIT ?`;
  return (db.prepare(sql).all(...args, q.limit) as { trace_id: string }[]).map((r) => r.trace_id);
}

function rowsByTrace(db: DatabaseSync, table: string, column: string, ids: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const sql = `SELECT trace_id, ${column} AS v FROM ${table} WHERE trace_id IN (${part.map(() => "?").join(",")})`;
    for (const r of db.prepare(sql).all(...part) as { trace_id: string; v: string }[]) {
      const list = out.get(r.trace_id);
      if (list) list.push(r.v);
      else out.set(r.trace_id, [r.v]);
    }
  }
  return out;
}

/** Build full traces, in the order of `ids`. `keepRemote` drops remotes the hub already has. */
export function loadTraces(db: DatabaseSync, ids: readonly string[], keepRemote: (endpoint: string) => boolean = () => true): Trace[] {
  if (ids.length === 0) return [];
  const spans = rowsByTrace(db, "spans", "json", ids);
  const logs = rowsByTrace(db, "logs", "json", ids);
  const remotes = rowsByTrace(db, "remotes", "endpoint", ids);
  return ids.map((id) => {
    const s = (spans.get(id) ?? []).map((j) => JSON.parse(j) as Span);
    const l = (logs.get(id) ?? []).map((j) => JSON.parse(j) as LogRecord).sort((a, b) => a.timeMs - b.timeMs);
    return buildTrace(id, s, l, (remotes.get(id) ?? []).filter(keepRemote));
  });
}

export function getStoredTrace(db: DatabaseSync, traceId: string, keepRemote?: (endpoint: string) => boolean): Trace | undefined {
  const exists = db.prepare("SELECT 1 FROM traces WHERE trace_id = ?").get(traceId);
  return exists ? loadTraces(db, [traceId], keepRemote)[0] : undefined;
}

interface ServiceRow {
  via: "addon" | "otlp" | "uptime";
  info: string;
  first_seen: number;
  last_seen: number;
}

/** Every service the hub knows, online ones first. */
export function listServices(db: DatabaseSync, now: number): HubService[] {
  const rows = db.prepare("SELECT via, info, first_seen, last_seen FROM services ORDER BY last_seen DESC").all() as unknown as ServiceRow[];
  return rows.map((r) => ({
    ...(JSON.parse(r.info) as HubSender),
    via: r.via,
    firstSeenMs: r.first_seen,
    lastSeenMs: r.last_seen,
    online: now - r.last_seen <= HUB_ONLINE_MS,
  }));
}

/** Environments (or projects) seen in services and traces, sorted. */
export function distinctOf(db: DatabaseSync, field: "env" | "project"): string[] {
  const serviceColumn = field === "env" ? "environment" : "project";
  const sql = `SELECT ${serviceColumn} AS v FROM services UNION SELECT DISTINCT ${field} FROM traces`;
  return (db.prepare(sql).all() as { v: string }[]).map((r) => r.v).filter(Boolean).sort();
}

export function countRows(db: DatabaseSync): { traces: number; spans: number } {
  const n = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { traces: n("traces"), spans: n("spans") };
}

