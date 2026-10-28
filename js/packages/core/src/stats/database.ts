import { queryText } from "../analysis.js";
import { isNoSqlSpan, noSqlOperation } from "../nosql.js";
import { isErrorSpan } from "../trace.js";
import type { Span, Trace } from "../types.js";
import { avgOf, groupBy, memoByObject, normalizeQuery, percentileOf, sumOf } from "./common.js";
import { requestOf } from "./requests.js";

/** One database call, with the request it belongs to. */
export interface DbCall {
  span: Span;
  traceId: string;
  startMs: number;
  durationMs: number;
  /** Request endpoint, for example "GET /api/orders/{}"; else the trace name. */
  endpoint: string;
  query: string;
  operation: string;
  table: string | null;
  system: string;
  rows: number | null;
  error: boolean;
}

export const OPERATIONS = ["SELECT", "INSERT", "UPDATE", "DELETE", "OTHER"] as const;
export type Operation = (typeof OPERATIONS)[number];

const TABLE_RE = /\b(?:FROM|INTO|UPDATE|JOIN)\s+["`[]?([\w.]+)/i;
/** Leading comments and session SETs are skipped: EF Core on SQL Server starts every save with "SET NOCOUNT ON;". */
const VERB_RE = /^\s*(?:--[^\n]*\n\s*)*(?:SET\s[^;]*;\s*)*(\w+)/i;

/** The statement's first verb, upper-case ("INSERT"); undefined for empty SQL. */
export const sqlVerb = (sql: string): string | undefined => VERB_RE.exec(sql)?.[1]?.toUpperCase();

/** SELECT, INSERT, UPDATE, DELETE, or OTHER, from db.operation.name or the first SQL word. NoSQL commands map to the closest one. */
export function operationOf(span: Span): Operation {
  const raw = span.attributes["db.operation.name"] ?? sqlVerb(queryText(span)) ?? "";
  if (isNoSqlSpan(span)) return noSqlOperation(String(raw));
  const op = String(raw).toUpperCase();
  return (OPERATIONS as readonly string[]).includes(op) ? (op as Operation) : "OTHER";
}

/** Table name from db.collection.name, else parsed from the SQL. */
export function tableOf(span: Span): string | null {
  const name = span.attributes["db.collection.name"];
  if (name != null && name !== "") return String(name);
  return TABLE_RE.exec(queryText(span))?.[1]?.replace(/[\]"`]/g, "") ?? null;
}

function callsOf(trace: Trace): DbCall[] {
  const endpoint = requestOf(trace)?.endpoint ?? trace.rootName;
  return trace.spans
    .filter((s) => s.category === "db")
    .map((span) => {
      const rows = span.attributes["db.response.returned_rows"];
      return {
        span,
        traceId: trace.traceId,
        startMs: span.startMs,
        durationMs: span.durationMs,
        endpoint,
        query: normalizeQuery(queryText(span)),
        operation: operationOf(span),
        table: tableOf(span),
        system: String(span.attributes["db.system.name"] ?? "database"),
        rows: typeof rows === "number" ? rows : rows == null ? null : Number(rows) || null,
        error: isErrorSpan(span),
      };
    });
}

const callsOfTrace = memoByObject(callsOf);

/** Every database call in the traces. */
export const dbCalls = (traces: readonly Trace[]): DbCall[] => traces.flatMap(callsOfTrace);

export interface DbSummary {
  queries: number;
  avgMs: number | null;
  slow: number;
  totalMs: number;
}

export function dbSummary(calls: readonly DbCall[], slowMs: number): DbSummary {
  const durations = calls.map((c) => c.durationMs);
  return { queries: calls.length, avgMs: avgOf(durations), slow: calls.filter((c) => c.durationMs >= slowMs).length, totalMs: sumOf(durations) };
}

/** One query shape: the same SQL with any values. */
export interface QueryRow {
  key: string;
  query: string;
  count: number;
  avgMs: number;
  maxMs: number;
  /** Null when the runs were stored without their spread. */
  p95Ms: number | null;
  totalMs: number;
  slow: number;
  errors: number;
  /** Endpoints that ran it, most frequent first. */
  endpoints: string[];
  system: string;
  exampleTraceId: string;
}

function endpointsByUse(calls: readonly DbCall[]): string[] {
  return [...groupBy(calls, (c) => c.endpoint)].sort((a, b) => b[1].length - a[1].length).map(([e]) => e);
}

/** Query shapes, slowest on average first. */
export function queryRows(calls: readonly DbCall[], slowMs: number): QueryRow[] {
  return [...groupBy(calls, (c) => c.query)]
    .map(([query, list]) => {
      const durations = list.map((c) => c.durationMs);
      const slowest = list.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
      return {
        key: query,
        query,
        count: list.length,
        avgMs: sumOf(durations) / list.length,
        maxMs: slowest.durationMs,
        p95Ms: percentileOf(durations, 95),
        totalMs: sumOf(durations),
        slow: list.filter((c) => c.durationMs >= slowMs).length,
        errors: list.filter((c) => c.error).length,
        endpoints: endpointsByUse(list),
        system: list[0]!.system,
        exampleTraceId: slowest.traceId,
      };
    })
    .sort((a, b) => b.avgMs - a.avgMs);
}

export interface TableRow {
  table: string;
  queries: number;
  avgMs: number;
  totalMs: number;
  /** Rows returned, summed. Null when no call reported a row count. */
  rows: number | null;
}

/** Tables by number of queries. Calls without a known table are left out. */
export function tableRows(calls: readonly DbCall[]): TableRow[] {
  const known = calls.filter((c) => c.table !== null);
  return [...groupBy(known, (c) => c.table!)]
    .map(([table, list]) => {
      const counted = list.filter((c) => c.rows !== null);
      const totalMs = sumOf(list.map((c) => c.durationMs));
      return { table, queries: list.length, avgMs: totalMs / list.length, totalMs, rows: counted.length ? sumOf(counted.map((c) => c.rows!)) : null };
    })
    .sort((a, b) => b.queries - a.queries);
}

export interface OperationRow {
  operation: Operation;
  count: number;
  avgMs: number | null;
  totalMs: number;
}

/** One row per operation, in a fixed order, including empty ones. */
export function operationRows(calls: readonly DbCall[]): OperationRow[] {
  const groups = groupBy(calls, (c) => c.operation);
  return OPERATIONS.map((operation) => {
    const durations = (groups.get(operation) ?? []).map((c) => c.durationMs);
    return { operation, count: durations.length, avgMs: avgOf(durations), totalMs: sumOf(durations) };
  });
}
