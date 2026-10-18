// List reads over the fact tables: the same filters, order, and paging as the memory executor's lists.
import { isSortKey, type SortKey } from "../../models/request-filter.js";
import type { TimeWindow } from "../../stats/common.js";
import { LOG_LEVELS, type LogRow } from "../../stats/logs.js";
import type { CriticalSpan } from "../../stats/traces.js";
import type { Health } from "../../health.js";
import type { LogLevel, Trace } from "../../types.js";
import { type Agg, emptyAgg } from "../agg.js";
import type { RequestItem, TraceItem } from "../facts-lists.js";
import type { ListFilter, ListNeed, ListRows } from "../needs.js";
import { boolOf, collate, floorOf, lit, num, numOrNull, type SqlSource, SqlText, scopeWhere, strOrNull, whereOf } from "./dialect.js";
import { servicesOf } from "./write-sql.js";

type Row = Record<string, unknown>;

const DURATIONS = new Set(["fast", "medium", "slow", "slowest"]);

const SORT_COLUMNS: Record<SortKey, string> = {
  time: "start_ms",
  path: "path",
  method: "method",
  status: "COALESCE(status, 0)",
  duration: "duration_ms",
  sql: "db_count",
  fetch: "fetch_ms",
  service: "service",
  insights: "insights",
};
const TEXT_SORTS = new Set<SortKey>(["path", "method", "service"]);

/** Request conditions, the same as `applyFilter`. */
function requestWhere(q: SqlText, f: ListFilter): string[] {
  const out: string[] = [];
  if (f.method) out.push(`method = ${q.p(f.method)}`);
  if (f.service) out.push(`(service = ${q.p(f.service)} OR ${q.contains("services", `\u001f${f.service}\u001f`)})`);
  if (f.status === "failed") out.push(`(errors > 0 OR COALESCE(status, 0) >= 500)`);
  else if (f.status) {
    const hundred = Number(f.status[0]) * 100;
    out.push(Number.isFinite(hundred) ? `COALESCE(status, 0) >= ${lit(hundred)} AND COALESCE(status, 0) < ${lit(hundred + 100)}` : "1 = 0");
  }
  if (f.duration && DURATIONS.has(f.duration)) out.push(`dur_class = ${q.p(f.duration)}`);
  const s = (f.q ?? "").trim().toLowerCase();
  if (s) out.push(`(${q.startsWith("trace_id", s)} OR ${q.contains("search", s)})`);
  return out;
}

/** Text search over a table's search column, or a trace id prefix. */
function textWhere(q: SqlText, text: string | undefined): string[] {
  const s = (text ?? "").trim().toLowerCase();
  return s ? [`(${q.startsWith("trace_id", s)} OR ${q.contains("search", s)})`] : [];
}

interface TableSql {
  table: string;
  time: string;
  where: (q: SqlText, f: ListFilter) => string[];
  order: (d: SqlSource["d"], need: ListNeed) => string;
  item: (r: Row) => unknown;
}

const tid = (d: SqlSource["d"]) => collate(d, "trace_id");

const TABLES: Record<ListNeed["table"], TableSql> = {
  requests: {
    table: "fact_requests",
    time: "start_ms",
    where: requestWhere,
    order: (d, need) => {
      const key: SortKey = isSortKey(need.sort.key) ? need.sort.key : "time";
      const col = TEXT_SORTS.has(key) ? collate(d, SORT_COLUMNS[key]) : SORT_COLUMNS[key];
      return `${col} ${need.sort.desc ? "DESC" : "ASC"}, start_ms DESC, ${tid(d)} ASC`;
    },
    item: requestItemOfRow,
  },
  traces: {
    table: "fact_traces",
    time: "start_ms",
    where: (q, f) => textWhere(q, f.q),
    order: (d, need) => (need.sort.desc ? `start_ms DESC, ${tid(d)} ASC` : `start_ms ASC, ${tid(d)} DESC`),
    item: traceItemOfRow,
  },
  logs: {
    table: "fact_logs",
    time: "time_ms",
    where: (q, f) => [`level_rank >= ${lit(LOG_LEVELS.indexOf(f.minLevel ?? "trace"))}`, ...(f.logService ? [`service = ${q.p(f.logService)}`] : []), ...textWhere(q, f.q)],
    order: (d, need) => (need.sort.desc ? `time_ms DESC, ${tid(d)} ASC, idx ASC` : `time_ms ASC, ${tid(d)} DESC, idx DESC`),
    item: logRowOfRow,
  },
  critical: {
    table: "fact_critical",
    time: "start_ms",
    where: () => [],
    order: (d) => `duration_ms DESC, start_ms DESC, ${tid(d)} ASC, ${collate(d, "span_id")} ASC`,
    item: criticalOfRow,
  },
};

export function requestItemOfRow(r: Row): RequestItem {
  return {
    traceId: String(r.trace_id), startMs: num(r.start_ms), method: String(r.method), path: String(r.path), endpoint: String(r.endpoint),
    status: numOrNull(r.status), aborted: boolOf(r.aborted), durationMs: num(r.duration_ms), serverMs: numOrNull(r.server_ms), dbMs: num(r.db_ms),
    dbCount: num(r.db_count), fetchCount: num(r.fetch_count), fetchMs: num(r.fetch_ms), renderMs: numOrNull(r.render_ms), networkMs: numOrNull(r.network_ms),
    service: String(r.service), services: servicesOf(String(r.services)), errors: num(r.errors), insights: num(r.insights), health: String(r.health) as Health,
    userAgent: strOrNull(r.user_agent), clientAddress: strOrNull(r.client_address), user: strOrNull(r.end_user), requestId: strOrNull(r.request_id),
    tags: JSON.parse(String(r.tags)) as string[],
  };
}

export function traceItemOfRow(r: Row): TraceItem {
  const health = strOrNull(r.health) as Health | null;
  return { traceId: String(r.trace_id), path: String(r.path), durationMs: num(r.duration_ms), health, status: String(r.status) as Trace["status"], services: servicesOf(String(r.services)), startMs: num(r.start_ms), spanCount: num(r.span_count), slow: boolOf(r.slow) };
}

export function logRowOfRow(r: Row): LogRow {
  const traceId = String(r.trace_id);
  return {
    key: `${traceId}:${num(r.idx)}`, traceId, traceName: String(r.trace_name), spanId: strOrNull(r.span_id), timeMs: num(r.time_ms), level: String(r.level) as LogLevel,
    service: String(r.service), category: String(r.category), message: String(r.message), attributes: JSON.parse(String(r.attributes)) as LogRow["attributes"],
  };
}

function criticalOfRow(r: Row): CriticalSpan {
  return { traceId: String(r.trace_id), spanId: String(r.span_id), name: String(r.name), service: String(r.service), layer: String(r.layer), durationMs: num(r.duration_ms), startMs: num(r.start_ms) };
}

function whereFor(q: SqlText, src: SqlSource, t: TableSql, f: ListFilter, w: TimeWindow): string {
  const conds = [...scopeWhere(q, src.scope), `${t.time} >= ${lit(w.from)}`, `${t.time} < ${lit(w.to)}`];
  if (f.traceId) conds.push(`trace_id = ${q.p(f.traceId)}`);
  return whereOf([...conds, ...t.where(q, f)]);
}

async function countOf(src: SqlSource, t: TableSql, f: ListFilter, w: TimeWindow): Promise<number> {
  const q = new SqlText(src.d);
  const [row] = await src.run.all(`SELECT COUNT(*) AS n FROM ${t.table} ${whereFor(q, src, t, f, w)}`, q.params);
  return num(row?.n);
}

async function itemsOf(src: SqlSource, t: TableSql, need: ListNeed, w: TimeWindow, limit: number | null, offset: number): Promise<unknown[]> {
  const q = new SqlText(src.d);
  const page = limit === null ? "" : ` LIMIT ${lit(limit)} OFFSET ${lit(offset)}`;
  const sql = `SELECT * FROM ${t.table} ${whereFor(q, src, t, need.filter, w)} ORDER BY ${t.order(src.d, need)}${page}`;
  return (await src.run.all(sql, q.params)).map(t.item);
}

/** Totals and per-bucket aggregates of the filtered requests, like `aggregateRequests`. */
async function aggregateSql(src: SqlSource, f: ListFilter, w: TimeWindow, buckets: number): Promise<{ total: Agg; series: Agg[] }> {
  const q = new SqlText(src.d);
  const b = floorOf(src.d, `((start_ms - ${lit(w.from)}) / ${lit(w.to - w.from)}) * ${lit(buckets)}`);
  const failed = `CASE WHEN ${q.isTrue("failed")} THEN 1 ELSE 0 END`;
  const cols = `${b} AS b, COUNT(*) AS n, SUM(${failed}) AS err, SUM(duration_ms) AS s, SUM(db_count) AS c0, SUM(CASE WHEN insights > 0 THEN 1 ELSE 0 END) AS c1, SUM(insights) AS c2`;
  const rows = await src.run.all(`SELECT ${cols} FROM fact_requests ${whereFor(q, src, TABLES.requests, f, w)} GROUP BY ${b}`, q.params);
  const blank = () => ({ ...emptyAgg(), firstMs: 0, lastMs: 0, topRank: 0 });
  const total = blank();
  const series = Array.from({ length: buckets }, blank);
  for (const r of rows) {
    const i = Math.min(buckets - 1, Math.max(0, num(r.b)));
    for (const a of [total, series[i]!]) {
      a.n += num(r.n);
      a.err += num(r.err);
      a.sum += num(r.s);
      [num(r.c0), num(r.c1), num(r.c2)].forEach((v, k) => (a.c[k] = a.c[k]! + v));
    }
  }
  return { total, series };
}

/** Answer one list need: count first when paging, then the page; or the first `limit` rows. */
export async function listSql(src: SqlSource, need: ListNeed, w: TimeWindow): Promise<ListRows> {
  const t = TABLES[need.table];
  let out: ListRows;
  if (need.page) {
    const size = need.page.size;
    const total = await countOf(src, t, need.filter, w);
    const page = Math.min(Math.max(1, need.page.page), Math.max(1, Math.ceil(total / size)));
    out = { items: await itemsOf(src, t, need, w, size, (page - 1) * size), total, page, pageSize: size };
  } else {
    const items = await itemsOf(src, t, need, w, need.limit === undefined ? null : Math.max(0, need.limit), 0);
    out = { items, total: need.count ? await countOf(src, t, need.filter, w) : null, page: 1, pageSize: items.length };
  }
  if (need.table === "requests" && need.aggregate) out.aggregate = await aggregateSql(src, need.filter, w, need.aggregate.buckets);
  return out;
}
