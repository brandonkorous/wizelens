// List needs in memory: filter, sort, and page the fact rows, with the same rules as the SQL executor.
import { applyFilter, isSortKey, sortRows } from "../models/request-filter.js";
import { traceMatches } from "../models/trace-filter.js";
import { bucketIndex, inWindow, type TimeWindow } from "../stats/common.js";
import { filterLogs, type LogRow } from "../stats/logs.js";
import { isFailed, type RequestRow } from "../stats/requests.js";
import type { CriticalSpan } from "../stats/traces.js";
import { addContribution, type Agg, contribution, emptyAgg, trimAgg } from "./agg.js";
import type { TraceFacts } from "./facts.js";
import type { RequestItem, TraceItem } from "./facts-lists.js";
import { KIND_SPEC } from "./kinds.js";
import type { ListFilter, ListNeed, ListRows } from "./needs.js";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Newest first, then trace id: the tie order of every list. */
const newest = <T extends { traceId: string }>(time: (t: T) => number) => (a: T, b: T) => time(b) - time(a) || cmp(a.traceId, b.traceId);

function requestRowsOf(facts: readonly TraceFacts[], f: ListFilter, w: TimeWindow): RequestItem[] {
  const items = facts.flatMap((x) => (x.request && inWindow(x.request.startMs, w) && (!f.traceId || x.traceId === f.traceId) ? [x.request] : []));
  const filter = { method: f.method ?? "", status: f.status ?? "", duration: f.duration ?? "", service: f.service ?? "", q: f.q ?? "", endpoint: f.endpoint ?? "", user: f.user ?? "", insights: f.insights ? "1" : "" };
  return applyFilter(items.sort(newest((r) => r.startMs)) as RequestRow[], filter);
}

function sortedRequests(rows: RequestItem[], need: ListNeed): RequestItem[] {
  const key = isSortKey(need.sort.key) ? need.sort.key : "time";
  return sortRows(rows as RequestRow[], { key, desc: need.sort.desc });
}

function traceRowsOf(facts: readonly TraceFacts[], f: ListFilter, w: TimeWindow, need: ListNeed): TraceItem[] {
  const q = (f.q ?? "").trim().toLowerCase();
  const hit = (t: TraceItem) => !q || t.traceId.startsWith(q) || t.path.toLowerCase().includes(q) || t.services.some((s) => s.toLowerCase().includes(q));
  const rows = facts.flatMap((x) => (inWindow(x.trace.startMs, w) && (!f.traceId || x.traceId === f.traceId) && hit(x.trace) && traceMatches(x.trace, f) ? [x.trace] : []));
  const sorted = rows.sort(newest((t) => t.startMs));
  if (need.sort.key === "duration") return sorted.sort((a, b) => (need.sort.desc ? b.durationMs - a.durationMs : a.durationMs - b.durationMs) || newest<TraceItem>((t) => t.startMs)(a, b));
  return need.sort.desc ? sorted : sorted.reverse();
}

const logIndex = (r: LogRow) => Number(r.key.slice(r.key.lastIndexOf(":") + 1));

function logRowsOf(facts: readonly TraceFacts[], f: ListFilter, w: TimeWindow, desc: boolean): LogRow[] {
  const rows = facts.flatMap((x) => (!f.traceId || x.traceId === f.traceId ? x.logs.filter((l) => inWindow(l.timeMs, w)) : []));
  const sorted = filterLogs(rows, { minLevel: f.minLevel ?? "trace", exact: f.exactLevel, service: f.logService ?? "", category: f.category ?? "", query: f.q ?? "" });
  sorted.sort((a, b) => b.timeMs - a.timeMs || cmp(a.traceId, b.traceId) || logIndex(a) - logIndex(b));
  return desc ? sorted : sorted.reverse();
}

function criticalRowsOf(facts: readonly TraceFacts[], f: ListFilter, w: TimeWindow): CriticalSpan[] {
  const rows = facts.flatMap((x) => (!f.traceId || x.traceId === f.traceId ? x.critical.filter((s) => inWindow(s.startMs, w) && (!f.service || s.service === f.service)) : []));
  return rows.sort((a, b) => b.durationMs - a.durationMs || newest<CriticalSpan>((s) => s.startMs)(a, b) || cmp(a.spanId, b.spanId));
}

/** Totals and per-bucket aggregates of request rows, the same fields as the "req" kind. */
export function aggregateRequests(rows: readonly RequestItem[], w: TimeWindow, buckets: number): { total: Agg; series: Agg[] } {
  const spec = { ...KIND_SPEC.req, hist: false };
  const total = emptyAgg();
  const series = Array.from({ length: buckets }, () => emptyAgg());
  for (const r of rows) {
    const c = contribution("req", "", r.startMs, { err: isFailed(r as RequestRow) ? 1 : 0, sum: r.durationMs, c: [r.dbCount, r.insights > 0 ? 1 : 0, r.insights] });
    addContribution(total, c, r.traceId, spec);
    const i = bucketIndex(r.startMs, w, buckets);
    if (i >= 0) addContribution(series[i]!, c, r.traceId, spec);
  }
  return { total: trimAgg(total, { times: false }), series: series.map((a) => trimAgg(a, { times: false })) };
}

/** Page or limit the rows. Pages clamp to the last page, like `pageOf`. */
function finish<T>(rows: T[], need: ListNeed): ListRows<T> {
  if (need.page) {
    const size = need.page.size;
    const page = Math.min(Math.max(1, need.page.page), Math.max(1, Math.ceil(rows.length / size)));
    return { items: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageSize: size };
  }
  const items = need.limit === undefined ? rows : rows.slice(0, need.limit);
  return { items, total: need.count ? rows.length : null, page: 1, pageSize: items.length };
}

/** Answer one list need from the facts. */
export function runList(facts: readonly TraceFacts[], need: ListNeed, w: TimeWindow): ListRows {
  const f = need.filter;
  if (need.table === "traces") return finish(traceRowsOf(facts, f, w, need), need);
  if (need.table === "logs") return finish(logRowsOf(facts, f, w, need.sort.desc), need);
  if (need.table === "critical") return finish(criticalRowsOf(facts, f, w), need);
  const rows = requestRowsOf(facts, f, w);
  const out: ListRows = finish(sortedRequests(rows, need), need);
  if (need.aggregate) out.aggregate = aggregateRequests(rows, w, need.aggregate.buckets);
  return out;
}
