// List reads over the fact tables: the same filters, order, and paging as the memory executor's lists.
import { durationRange, isSortKey, type SortKey } from "../../models/request-filter.js";
import type { TimeWindow } from "../../stats/common.js";
import { LOG_LEVELS, type LogRow } from "../../stats/logs.js";
import type { CriticalSpan } from "../../stats/traces.js";
import type { Health } from "../../health.js";
import type { LogLevel, Trace } from "../../types.js";
import { LOOSE_TRACE_PREFIX } from "../../loose.js";
import { aggregateSql } from "./list-agg-sql.js";
import type { RequestItem, TraceItem } from "../facts-lists.js";
import type { ListFilter, ListNeed, ListRows } from "../needs.js";
import { boolOf, collate, lit, msLit, num, numOrNull, type SqlSource, SqlText, scopeWhere, strOrNull, whereOf } from "./dialect.js";
import { labelRow, type LabeledRow, unlabelPart } from "./project-keys.js";
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
  errors: "errors",
  db: "db_ms",
};
const TEXT_SORTS = new Set<SortKey>(["path", "method", "service"]);

/** Request conditions, the same as `applyFilter`. */
function requestWhere(q: SqlText, f: ListFilter): string[] {
  const out: string[] = [];
  if (f.method) out.push(`method = ${q.p(f.method)}`);
  if (f.service) out.push(`(service = ${q.p(f.service)} OR ${q.contains("services", `\u001f${f.service}\u001f`)})`);
  if (f.status === "failed") out.push(q.isTrue("failed"));
  else if (f.status) {
    const hundred = Number(f.status[0]) * 100;
    out.push(Number.isFinite(hundred) ? `COALESCE(status, 0) >= ${lit(hundred)} AND COALESCE(status, 0) < ${lit(hundred + 100)}` : "1 = 0");
  }
  if (f.duration && DURATIONS.has(f.duration)) out.push(`dur_class = ${q.p(f.duration)}`);
  if (f.endpoint) out.push(`endpoint = ${q.p(f.endpoint)}`);
  if (f.user) out.push(`end_user = ${q.p(f.user)}`);
  if (f.insights) out.push(`insights > 0`);
  const s = (f.q ?? "").trim().toLowerCase();
  if (s) out.push(`(${q.startsWith("trace_id", s)} OR ${q.textHas("fact_requests", "search", s)})`);
  return out;
}

/** Text search over a table's search column, or a trace id prefix. */
function textWhere(q: SqlText, table: string, text: string | undefined): string[] {
  const s = (text ?? "").trim().toLowerCase();
  return s ? [`(${q.startsWith("trace_id", s)} OR ${q.textHas(table, "search", s)})`] : [];
}

/** Trace conditions, the same as `traceMatches` and the memory text match. */
function traceWhere(q: SqlText, f: ListFilter): string[] {
  const out = textWhere(q, "fact_traces", f.q);
  if (f.service) out.push(q.contains("services", `\u001f${f.service}\u001f`));
  if (f.status === "error") out.push(`status = 'error'`);
  if (f.status === "ok") out.push(`status <> 'error'`);
  const range = f.duration ? durationRange(f.duration) : null;
  if (range) out.push(`duration_ms >= ${lit(range[0])}${Number.isFinite(range[1]) ? ` AND duration_ms < ${lit(range[1])}` : ""}`);
  return out;
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
    where: traceWhere,
    order: (d, need) => {
      if (need.sort.key === "duration") return `duration_ms ${need.sort.desc ? "DESC" : "ASC"}, start_ms DESC, ${tid(d)} ASC`;
      return need.sort.desc ? `start_ms DESC, ${tid(d)} ASC` : `start_ms ASC, ${tid(d)} DESC`;
    },
    item: traceItemOfRow,
  },
  logs: {
    table: "fact_logs",
    time: "time_ms",
    where: (q, f) => [
      `level_rank ${f.exactLevel ? "=" : ">="} ${lit(LOG_LEVELS.indexOf(f.minLevel ?? "trace"))}`,
      ...(f.logService ? [`service = ${q.p(f.logService)}`] : []),
      ...(f.category ? [`category = ${q.p(f.category)}`] : []),
      ...(f.pattern ? [`pattern = ${q.p(f.pattern)}`] : []),
      ...(f.logOrigin ? [`${f.logOrigin === "outside" ? "" : "NOT "}(${q.startsWith("trace_id", LOOSE_TRACE_PREFIX)})`] : []),
      ...textWhere(q, "fact_logs", f.q),
    ],
    order: (d, need) => (need.sort.desc ? `time_ms DESC, ${tid(d)} ASC, idx ASC` : `time_ms ASC, ${tid(d)} DESC, idx DESC`),
    item: logRowOfRow,
  },
  critical: {
    table: "fact_critical",
    time: "start_ms",
    where: (q, f) => (f.service ? [`service = ${q.p(f.service)}`] : []),
    order: (d) => `duration_ms DESC, start_ms DESC, ${tid(d)} ASC, ${collate(d, "span_id")} ASC`,
    item: criticalOfRow,
  },
};

export function requestItemOfRow(r: Row): RequestItem {
  return {
    traceId: String(r.trace_id), startMs: num(r.start_ms), method: String(r.method), path: String(r.path), endpoint: String(r.endpoint),
    status: numOrNull(r.status),
    // Only `failed` is stored: a 5xx that did not fail is one the app expected.
    expected: !boolOf(r.failed) && (numOrNull(r.status) ?? 0) >= 500,
    aborted: boolOf(r.aborted), durationMs: num(r.duration_ms), serverMs: numOrNull(r.server_ms), dbMs: num(r.db_ms),
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

/** The read's project labels when it covers many projects. */
const labelsOf = (src: SqlSource) => ((src.scope.projects?.length ?? 0) > 1 ? (src.scope.labels ?? null) : null);

/** A service filter that names a labeled service reads that project's rows of the service. */
function unlabeled(q: SqlText, src: SqlSource, f: ListFilter): { f: ListFilter; where: string[] } {
  const labels = labelsOf(src);
  if (!labels) return { f, where: [] };
  const service = f.service ? unlabelPart(f.service, labels) : null;
  const logService = f.logService ? unlabelPart(f.logService, labels) : null;
  const projects = [...new Set([service?.project, logService?.project].filter((p): p is string => !!p))];
  const out = { ...f, ...(service ? { service: service.key } : {}), ...(logService ? { logService: logService.key } : {}) };
  return { f: out, where: projects.map((p) => `${src.d.project} = ${q.p(p)}`) };
}

function whereFor(q: SqlText, src: SqlSource, t: TableSql, filter: ListFilter, w: TimeWindow): string {
  const conds = [...scopeWhere(q, src.scope), `${t.time} >= ${msLit(q.d, w.from)}`, `${t.time} < ${msLit(q.d, w.to)}`];
  const { f, where } = unlabeled(q, src, filter);
  conds.push(...where);
  if (f.traceId) conds.push(`trace_id = ${q.p(f.traceId)}`);
  if (f.traceIds) conds.push(q.in("trace_id", f.traceIds));
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
  const labels = labelsOf(src);
  const rows = await src.run.all(sql, q.params);
  return labels ? rows.map((r) => labelRow(t.item(r) as LabeledRow, labels[String(r[src.d.project])] ?? "")) : rows.map(t.item);
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
  if (need.aggregate && (need.table === "requests" || need.table === "logs")) {
    const q = new SqlText(src.d);
    out.aggregate = await aggregateSql(src, q, need.table, whereFor(q, src, t, need.filter, w), w, need.aggregate.buckets);
  }
  return out;
}
