// Runs a search on a host's fact tables and returns the same page as the memory runner.
import type { SearchKind } from "../../search/ast.js";
import type { SearchItems, SpanItem } from "../../search/items.js";
import { clampLimit, pageOf, type SearchPage, type SearchQuery } from "../../search/run.js";
import type { SpanCategory, SpanKind, SpanStatus } from "../../types.js";
import { collate, type Dialect, lit, msLit, num, numOrNull, type SqlSource, SqlText, scopeWhere, strOrNull, textOf } from "./dialect.js";
import { logRowOfRow, requestItemOfRow, traceItemOfRow } from "./list-sql.js";
import { searchCond } from "./search-sql.js";
import { servicesOf } from "./write-sql.js";

type Row = Record<string, unknown>;

/** The result table each kind joins, and how its rows become items. Spans read fact_search itself. */
const JOINS: Record<SearchKind, { table: string | null; time: string; on: (d: Dialect) => string; item: (r: Row) => unknown }> = {
  requests: { table: "fact_requests", time: "start_ms", on: () => "r.trace_id = s.trace_id", item: requestItemOfRow },
  traces: { table: "fact_traces", time: "start_ms", on: () => "r.trace_id = s.trace_id", item: traceItemOfRow },
  logs: { table: "fact_logs", time: "time_ms", on: (d) => `r.trace_id = s.trace_id AND ${textOf(d, "r.idx")} = s.owner`, item: logRowOfRow },
  spans: { table: null, time: "", on: () => "", item: spanItemOfRow },
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

/** The page's SQL; `joined` false reads fact_search alone (ClickHouse then fetches the page's rows itself). */
function searchSqlText<K extends SearchKind>(src: SqlSource, query: SearchQuery<K>, limit: number, joined = true): { sql: string; params: unknown[] } {
  const q = new SqlText(src.d);
  const join = joined ? JOINS[query.kind] : JOINS.spans;
  const project = src.d.project;
  const from = join.table ? `fact_search s JOIN ${join.table} r ON r.${project} = s.${project} AND ${join.on(src.d)}` : "fact_search s";
  const where = [
    ...scopeWhere(q, { ...src.scope, env: query.env ?? src.scope.env }, "s."), `s.kind = ${q.p(query.kind)}`,
    `s.time_ms >= ${msLit(q.d, query.window.from)}`, `s.time_ms < ${msLit(q.d, query.window.to)}`,
    ...(query.cursor ? [cursorCond(q, query.cursor)] : []), ...(query.traceIds ? [q.in("s.trace_id", query.traceIds)] : []),
    searchCond(q, query.kind, query.node, src.scope.project),
  ];
  const cols = join.table ? "r.*, s.time_ms AS s_time, s.owner AS s_owner" : "s.*, s.time_ms AS s_time, s.owner AS s_owner";
  const order = `s.time_ms DESC, ${collate(src.d, "s.trace_id")} ASC, ${collate(src.d, "s.owner")} ASC`;
  return { sql: `SELECT ${cols} FROM ${from} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${lit(limit + 1)}`, params: q.params };
}

/** How far back the first step of a ClickHouse page looks: most pages fill from the newest day, so the rest is never read. */
const STEPS_MS = [86_400_000];

/** The page's fact_search rows, newest slice first; slices are disjoint in time, so their rows follow one another in result order. */
async function chPage<K extends SearchKind>(src: SqlSource, query: SearchQuery<K>, limit: number): Promise<Row[]> {
  const top = Math.min(query.window.to, query.cursor ? query.cursor.timeMs + 1 : Infinity);
  const out: Row[] = [];
  let to = query.window.to;
  for (const step of [...STEPS_MS, Infinity]) {
    const from = Math.max(query.window.from, top - step);
    if (from >= to) continue;
    const t = searchSqlText(src, { ...query, window: { from, to } }, limit - out.length, false);
    out.push(...(await src.run.all(t.sql, t.params)));
    if (out.length > limit || from <= query.window.from) return out;
    to = from;
  }
  return out;
}

/** ClickHouse: the page from fact_search, then only its rows from the kind's table; a join would read the project's whole table. */
async function chRows<K extends SearchKind>(src: SqlSource, query: SearchQuery<K>, limit: number): Promise<Row[]> {
  const page = await chPage(src, query, limit);
  const join = JOINS[query.kind];
  if (!join.table || !page.length) return page;
  const q = new SqlText(src.d);
  const times = page.map((r) => num(r.s_time));
  const where = [...scopeWhere(q, { project: src.scope.project }), `${join.time} >= ${msLit(q.d, Math.min(...times))}`, `${join.time} <= ${msLit(q.d, Math.max(...times))}`];
  const found = await src.run.all(`SELECT * FROM ${join.table} WHERE ${[...where, q.in("trace_id", [...new Set(page.map((r) => String(r.trace_id)))])].join(" AND ")}`, q.params);
  const keyOf = (traceId: unknown, owner: string) => `${String(traceId)} ${owner}`;
  const byKey = new Map(found.map((r) => [keyOf(r.trace_id, query.kind === "logs" ? String(r.idx) : ""), r]));
  return page.flatMap((p) => {
    const r = byKey.get(keyOf(p.trace_id, query.kind === "logs" ? String(p.s_owner) : ""));
    return r ? [{ ...r, s_time: p.s_time, s_owner: p.s_owner }] : [];
  });
}

/** One page of search results from fact_search, joined to the kind's list table. */
export async function searchSql<K extends SearchKind>(src: SqlSource, query: SearchQuery<K>): Promise<SearchPage<K>> {
  const limit = clampLimit(query.limit);
  const run = (t: { sql: string; params: unknown[] }) => src.run.all(t.sql, t.params);
  const rows = src.d.name === "ch" ? await chRows(src, query, limit) : await run(searchSqlText(src, query, limit));
  const keyOf = (r: Row) => ({ timeMs: num(r.s_time), traceId: String(r.trace_id), owner: String(r.s_owner) });
  const page = pageOf(rows, limit, keyOf);
  return { kind: query.kind, items: page.rows.map(JOINS[query.kind].item) as SearchItems[K][], next: page.next };
}
