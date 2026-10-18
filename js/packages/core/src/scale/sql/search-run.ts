// Runs a search on a host's fact tables and returns the same page as the memory runner.
import type { SearchKind } from "../../search/ast.js";
import type { SearchItems, SpanItem } from "../../search/items.js";
import { clampLimit, pageOf, type SearchPage, type SearchQuery } from "../../search/run.js";
import type { SpanCategory, SpanKind, SpanStatus } from "../../types.js";
import { collate, type Dialect, lit, num, numOrNull, type SqlSource, SqlText, scopeWhere, strOrNull, textOf } from "./dialect.js";
import { logRowOfRow, requestItemOfRow, traceItemOfRow } from "./list-sql.js";
import { searchCond } from "./search-sql.js";
import { servicesOf } from "./write-sql.js";

type Row = Record<string, unknown>;

/** The result table each kind joins, and how its rows become items. Spans read fact_search itself. */
const JOINS: Record<SearchKind, { table: string | null; on: (d: Dialect) => string; item: (r: Row) => unknown }> = {
  requests: { table: "fact_requests", on: () => "r.trace_id = s.trace_id", item: requestItemOfRow },
  traces: { table: "fact_traces", on: () => "r.trace_id = s.trace_id", item: traceItemOfRow },
  logs: { table: "fact_logs", on: (d) => `r.trace_id = s.trace_id AND ${textOf(d, "r.idx")} = s.owner`, item: logRowOfRow },
  spans: { table: null, on: () => "", item: spanItemOfRow },
};

function spanItemOfRow(r: Row): SpanItem {
  return {
    traceId: String(r.trace_id), spanId: String(r.owner), startMs: num(r.time_ms), durationMs: num(r.duration_ms), service: servicesOf(String(r.service))[0] ?? "",
    name: String(r.name ?? ""), kind: String(r.span_kind) as SpanKind, category: String(r.category) as SpanCategory, status: String(r.outcome) as SpanStatus,
    method: strOrNull(r.method), path: strOrNull(r.path), route: strOrNull(r.route), httpStatus: numOrNull(r.status), user: strOrNull(r.end_user),
  };
}

/** Rows after the cursor in result order: newest first, then trace id, then owner. */
function cursorCond(q: SqlText, c: NonNullable<SearchQuery["cursor"]>): string {
  const [tid, owner] = [collate(q.d, "s.trace_id"), collate(q.d, "s.owner")];
  return `(s.time_ms < ${q.p(c.timeMs)} OR (s.time_ms = ${q.p(c.timeMs)} AND (${tid} > ${q.p(c.traceId)} OR (s.trace_id = ${q.p(c.traceId)} AND ${owner} > ${q.p(c.owner)}))))`;
}

function searchSqlText<K extends SearchKind>(src: SqlSource, query: SearchQuery<K>, limit: number): { sql: string; params: unknown[] } {
  const q = new SqlText(src.d);
  const join = JOINS[query.kind];
  const project = src.d.project;
  const from = join.table ? `fact_search s JOIN ${join.table} r ON r.${project} = s.${project} AND ${join.on(src.d)}` : "fact_search s";
  const where = [
    ...scopeWhere(q, { ...src.scope, env: query.env ?? src.scope.env }, "s."), `s.kind = ${q.p(query.kind)}`,
    `s.time_ms >= ${lit(query.window.from)}`, `s.time_ms < ${lit(query.window.to)}`,
    ...(query.cursor ? [cursorCond(q, query.cursor)] : []), searchCond(q, query.kind, query.node, src.scope.project),
  ];
  const cols = join.table ? "r.*, s.time_ms AS s_time, s.owner AS s_owner" : "s.*, s.time_ms AS s_time, s.owner AS s_owner";
  const order = `s.time_ms DESC, ${collate(src.d, "s.trace_id")} ASC, ${collate(src.d, "s.owner")} ASC`;
  return { sql: `SELECT ${cols} FROM ${from} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${lit(limit + 1)}`, params: q.params };
}

/** One page of search results from fact_search, joined to the kind's list table. */
export async function searchSql<K extends SearchKind>(src: SqlSource, query: SearchQuery<K>): Promise<SearchPage<K>> {
  const limit = clampLimit(query.limit);
  const { sql, params } = searchSqlText(src, query, limit);
  // ClickHouse names joined columns "r.col"; the other databases name them "col".
  const rows = (await src.run.all(sql, params)).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.startsWith("r.") ? k.slice(2) : k, v])));
  const keyOf = (r: Row) => ({ timeMs: num(r.s_time), traceId: String(r.trace_id), owner: String(r.s_owner) });
  const page = pageOf(rows, limit, keyOf);
  return { kind: query.kind, items: page.rows.map(JOINS[query.kind].item) as SearchItems[K][], next: page.next };
}
