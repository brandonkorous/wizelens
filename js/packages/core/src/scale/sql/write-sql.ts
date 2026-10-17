// Writes for the stats tables, shared by both hosts: fact rows, rollup and hist upserts, and fact deletes.
import { levelRank, type LogRow } from "../../stats/logs.js";
import type { CriticalSpan } from "../../stats/traces.js";
import type { Scope } from "../compact.js";
import type { HistDelta, RollupDelta, SettleDelta } from "../delta.js";
import type { TraceFacts } from "../facts.js";
import type { RequestItem, TraceItem } from "../facts-lists.js";
import { durationClassOf, statusClassOf } from "../facts-requests.js";
import { KEY_SEP, KIND_SPEC, ROLLUP_KINDS } from "../kinds.js";
import { TIERS } from "../window.js";
import { type Dialect, greatestOf, leastOf, paramOf, type Statement } from "./dialect.js";

const CHUNK = 200;
/** Stand-ins for missing times and ranks, since the columns are NOT NULL. Real values always win against them. */
export const NONE_LOW = -8.64e15;
export const NONE_HIGH = 8.64e15;
/** Most trace ids a rollup row keeps, and the text length that holds them (32-character ids and spaces). */
export const IDS_MAX = Math.max(...ROLLUP_KINDS.map((k) => KIND_SPEC[k].ids));
export const IDS_CHARS = IDS_MAX * 33 - 1;

/** Trace ids from a rollup row's ids text, newest first. A cut-off last id is dropped. */
export function idsOfText(text: string): string[] {
  const ids = text.split(" ").filter(Boolean);
  return text.length >= IDS_CHARS ? ids.slice(0, -1) : ids;
}

/** Services as stored: "␟a␟b␟", or "" for none. */
export const servicesText = (services: readonly string[]): string => (services.length ? `${KEY_SEP}${services.join(KEY_SEP)}${KEY_SEP}` : "");

export const servicesOf = (text: string): string[] => (text ? text.slice(1, -1).split(KEY_SEP) : []);

/** Lowercased text that `q` searches, one field per part. */
export const searchText = (fields: readonly (string | null)[]): string => fields.flatMap((f) => (f === null ? [] : [f.toLowerCase()])).join(KEY_SEP);

/** A whole number that fits an INTEGER column. */
const int32 = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : Math.max(-2147483648, Math.min(2147483647, Math.round(v))));

export const FACT_COLUMNS = {
  fact_requests: ["trace_id", "env", "start_ms", "method", "path", "endpoint", "status", "status_class", "failed", "dur_class", "aborted", "duration_ms", "server_ms", "db_ms", "db_count", "fetch_count", "fetch_ms", "render_ms", "network_ms", "service", "services", "errors", "insights", "health", "user_agent", "client_address", "end_user", "request_id", "tags", "search"],
  fact_traces: ["trace_id", "env", "start_ms", "path", "duration_ms", "health", "status", "services", "span_count", "slow", "search"],
  fact_logs: ["trace_id", "idx", "env", "time_ms", "level", "level_rank", "service", "category", "message", "trace_name", "span_id", "attributes", "search"],
  fact_critical: ["trace_id", "span_id", "env", "start_ms", "duration_ms", "name", "service", "layer"],
} as const;

export type FactTable = keyof typeof FACT_COLUMNS;
export const FACT_TABLES = Object.keys(FACT_COLUMNS) as FactTable[];

function requestValues(r: RequestItem, env: string): unknown[] {
  const failed = r.errors > 0 || (r.status ?? 0) >= 500;
  const search = searchText([r.path, r.endpoint, r.user, r.requestId, r.clientAddress, ...r.tags]);
  return [r.traceId, env, r.startMs, r.method, r.path, r.endpoint, int32(r.status), statusClassOf(r.status), failed, durationClassOf(r.durationMs), r.aborted, r.durationMs, r.serverMs, r.dbMs, int32(r.dbCount), int32(r.fetchCount), r.fetchMs, r.renderMs, r.networkMs, r.service, servicesText(r.services), int32(r.errors), int32(r.insights), r.health, r.userAgent, r.clientAddress, r.user, r.requestId, JSON.stringify(r.tags), search];
}

const traceValues = (t: TraceItem, env: string): unknown[] => [t.traceId, env, t.startMs, t.path, t.durationMs, t.health, t.status, servicesText(t.services), int32(t.spanCount), t.slow, searchText([t.path, ...t.services])];

function logValues(l: LogRow, env: string): unknown[] {
  const idx = Number(l.key.slice(l.key.lastIndexOf(":") + 1));
  const search = searchText([l.message, l.category, l.traceName]);
  return [l.traceId, int32(idx), env, l.timeMs, l.level, levelRank(l.level), l.service, l.category, l.message, l.traceName, l.spanId, JSON.stringify(l.attributes ?? {}), search];
}

const criticalValues = (s: CriticalSpan, env: string): unknown[] => [s.traceId, s.spanId, env, s.startMs, s.durationMs, s.name, s.service, s.layer];

/** The fact rows of one trace per table, project first. */
export function factRows(f: TraceFacts, scope: Scope): Record<FactTable, unknown[][]> {
  const p = (values: unknown[]) => [scope.project, ...values];
  return {
    fact_requests: f.request ? [p(requestValues(f.request, scope.env))] : [],
    fact_traces: [p(traceValues(f.trace, scope.env))],
    fact_logs: f.logs.map((l) => p(logValues(l, scope.env))),
    fact_critical: f.critical.map((s) => p(criticalValues(s, scope.env))),
  };
}

/** Multi-row inserts, `CHUNK` rows each, with a tail such as an ON CONFLICT clause. */
export function insertStatements(d: Dialect, table: string, cols: readonly string[], rows: readonly unknown[][], tail = ""): Statement[] {
  const out: Statement[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    let n = 0;
    const ph = () => (d.name === "pg" ? `$${++n}` : "?");
    const values = part.map((r) => `(${r.map(ph).join(", ")})`).join(", ");
    out.push({ sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${values}${tail ? ` ${tail}` : ""}`, params: part.flat().map((v) => paramOf(d, v)) });
  }
  return out;
}

/** Insert one trace set's fact rows. */
export function factInserts(d: Dialect, rows: Record<FactTable, unknown[][]>): Statement[] {
  return FACT_TABLES.flatMap((t) => insertStatements(d, t, [d.project, ...FACT_COLUMNS[t]], rows[t], "ON CONFLICT DO NOTHING"));
}

/** Delete the fact rows of some traces: by project and id on the cloud, by id alone on the hub (null project). */
export function factDeletes(d: Dialect, project: string | null, ids: readonly string[]): Statement[] {
  if (!ids.length) return [];
  return FACT_TABLES.map((t) => {
    if (d.name === "pg") return { sql: `DELETE FROM ${t} WHERE ${project === null ? "" : `${d.project} = $2 AND `}trace_id = ANY($1)`, params: project === null ? [[...ids]] : [[...ids], project] };
    const scoped = project === null ? "" : ` AND ${d.project} = ?`;
    return { sql: `DELETE FROM ${t} WHERE trace_id IN (SELECT value FROM json_each(?))${scoped}`, params: project === null ? [JSON.stringify(ids)] : [JSON.stringify(ids), project] };
  });
}

const ROLLUP_COLS = (d: Dialect) => [d.project, "env", "kind", "key", "bucket_ms", "n", "err", "sum_v", "c0", "c1", "c2", "c3", "c4", "c5", "first_ms", "last_ms", "top_rank", "top", "ids"];

function rollupTail(d: Dialect, table: string): string {
  const add = ["n", "err", "sum_v", "c0", "c1", "c2", "c3", "c4", "c5"].map((c) => `${c} = ${table}.${c} + excluded.${c}`);
  const newer = `excluded.last_ms >= ${table}.last_ms`;
  const ids = `CASE WHEN excluded.ids = '' THEN ${table}.ids WHEN ${table}.ids = '' THEN excluded.ids WHEN ${newer} THEN substr(excluded.ids || ' ' || ${table}.ids, 1, ${IDS_CHARS}) ELSE substr(${table}.ids || ' ' || excluded.ids, 1, ${IDS_CHARS}) END`;
  return `ON CONFLICT (${d.project}, kind, bucket_ms, env, key) DO UPDATE SET ${add.join(", ")},
    first_ms = ${leastOf(d, `${table}.first_ms`, "excluded.first_ms")}, last_ms = ${greatestOf(d, `${table}.last_ms`, "excluded.last_ms")},
    top = CASE WHEN excluded.top_rank > ${table}.top_rank THEN excluded.top ELSE ${table}.top END,
    top_rank = ${greatestOf(d, `${table}.top_rank`, "excluded.top_rank")}, ids = ${ids}`;
}

const rollupValues = (r: RollupDelta): unknown[] => [r.project, r.env, r.kind, r.key, r.bucket, r.n, r.err, r.sum, ...r.c.slice(0, 6), r.firstMs ?? NONE_HIGH, r.lastMs ?? NONE_LOW, r.topRank ?? NONE_LOW, r.topRank === null ? null : JSON.stringify(r.top ?? null), r.ids];

const histValues = (h: HistDelta): unknown[] => [h.project, h.env, h.kind, h.key, h.bucket, h.bin, h.cnt];

/** Upserts that apply a merged settle delta to every tier. */
export function deltaStatements(d: Dialect, delta: SettleDelta): Statement[] {
  return TIERS.flatMap((t) => {
    const rollup = delta.rollup.filter((r) => r.tier === t.name).map(rollupValues);
    const hist = delta.hist.filter((h) => h.tier === t.name).map(histValues);
    const histTail = `ON CONFLICT (${d.project}, kind, bucket_ms, env, key, bin) DO UPDATE SET cnt = ${t.hist}.cnt + excluded.cnt`;
    return [
      ...insertStatements(d, t.table, ROLLUP_COLS(d), rollup, rollupTail(d, t.table)),
      ...insertStatements(d, t.hist, [d.project, "env", "kind", "key", "bucket_ms", "bin", "cnt"], hist, histTail),
    ];
  });
}
