import type { RequestItem } from "@wizeworks/lens-core";
import { type CsvColumns, downloadCsv as save, isoTime, round2, toCsv as csvOf } from "../../data/csv";

const COLUMNS: CsvColumns<RequestItem> = [
  ["time", (r) => isoTime(r.startMs)],
  ["method", (r) => r.method],
  ["path", (r) => r.path],
  ["endpoint", (r) => r.endpoint],
  ["status", (r) => r.status],
  ["duration_ms", (r) => round2(r.durationMs)],
  ["server_ms", (r) => round2(r.serverMs)],
  ["db_ms", (r) => round2(r.dbMs)],
  ["sql_queries", (r) => r.dbCount],
  ["fetch_calls", (r) => r.fetchCount],
  ["fetch_ms", (r) => round2(r.fetchMs)],
  ["render_ms", (r) => round2(r.renderMs)],
  ["network_ms", (r) => round2(r.networkMs)],
  ["service", (r) => r.service],
  ["errors", (r) => r.errors],
  ["insights", (r) => r.insights],
  ["user", (r) => r.user],
  ["client_address", (r) => r.clientAddress],
  ["request_id", (r) => r.requestId],
  ["trace_id", (r) => r.traceId],
  ["tags", (r) => r.tags.join(" ")],
];

export const toCsv = (rows: readonly RequestItem[]): string => csvOf(COLUMNS, rows);

/** Download the rows as a CSV file. Built in the browser; nothing is sent anywhere. */
export const downloadCsv = (rows: readonly RequestItem[]): void => save("requests", toCsv(rows));
