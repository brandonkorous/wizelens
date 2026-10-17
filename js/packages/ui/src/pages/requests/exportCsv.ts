import type { RequestItem } from "@wizeworks/lens-core";

type Cell = string | number | null;

const COLUMNS: [string, (r: RequestItem) => Cell][] = [
  ["time", (r) => new Date(r.startMs).toISOString()],
  ["method", (r) => r.method],
  ["path", (r) => r.path],
  ["endpoint", (r) => r.endpoint],
  ["status", (r) => r.status],
  ["duration_ms", (r) => round(r.durationMs)],
  ["server_ms", (r) => round(r.serverMs)],
  ["db_ms", (r) => round(r.dbMs)],
  ["sql_queries", (r) => r.dbCount],
  ["fetch_calls", (r) => r.fetchCount],
  ["fetch_ms", (r) => round(r.fetchMs)],
  ["render_ms", (r) => round(r.renderMs)],
  ["network_ms", (r) => round(r.networkMs)],
  ["service", (r) => r.service],
  ["errors", (r) => r.errors],
  ["insights", (r) => r.insights],
  ["user", (r) => r.user],
  ["client_address", (r) => r.clientAddress],
  ["request_id", (r) => r.requestId],
  ["trace_id", (r) => r.traceId],
  ["tags", (r) => r.tags.join(" ")],
];

function round(ms: number | null): number | null {
  return ms === null ? null : Math.round(ms * 100) / 100;
}

/** One CSV field. Quotes it when it holds a comma, a quote, or a line break. */
function field(v: Cell): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly RequestItem[]): string {
  const head = COLUMNS.map(([name]) => name).join(",");
  const body = rows.map((r) => COLUMNS.map(([, get]) => field(get(r))).join(","));
  return [head, ...body].join("\r\n");
}

/** Download the rows as a CSV file. Built in the browser; nothing is sent anywhere. */
export function downloadCsv(rows: readonly RequestItem[]): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wizelens-requests-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
