import { describe, expect, it } from "vitest";
import { inWindow, series } from "../stats/common.js";
import { filterLogs, logRows } from "../stats/logs.js";
import { isFailed, requestRows } from "../stats/requests.js";
import { criticalSpans } from "../stats/traces.js";
import { applyFilter, sortRows } from "../testing/legacy/request-filter.js";
import { traceListItem } from "../testing/legacy/traces.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import type { RequestItem, TraceItem } from "./facts-lists.js";
import { memoryExecutor } from "./memory.js";
import type { ListNeed } from "./needs.js";
import { pageContext } from "./run.js";

const traces = scenarioTraces();
const ex = memoryExecutor(traces);
const ctx = pageContext("24h", SCENARIO_NOW, {});
const cur = traces.filter((t) => inWindow(t.startMs, ctx.window));
const rows = requestRows(cur);
const list = (need: Omit<ListNeed, "type" | "id" | "window">) => ex.runSync([{ type: "list", id: "l", window: "cur", ...need }], ctx).lists.l!;
const none = { method: "", status: "", duration: "", service: "", q: "" };

describe("memory executor: request lists", () => {
  it("pages newest first like the Requests page", () => {
    const got = list({ table: "requests", filter: {}, sort: { key: "time", desc: true }, page: { page: 2, size: 15 } });
    expect(got).toMatchObject({ total: rows.length, page: 2, pageSize: 15 });
    expect((got.items as RequestItem[]).map((r) => r.traceId)).toEqual(rows.slice(15, 30).map((r) => r.traceId));
  });

  it("filters and sorts by every key, then clamps the page", () => {
    for (const key of ["path", "method", "status", "duration", "sql", "fetch", "service", "insights"]) {
      const want = sortRows(applyFilter(rows, { ...none, service: "api" }), { key: key as "path", desc: false });
      const got = list({ table: "requests", filter: { service: "api" }, sort: { key, desc: false }, page: { page: 999, size: 10 } });
      const last = Math.ceil(want.length / 10);
      expect([got.total, got.page]).toEqual([want.length, last]);
      const value = (r: RequestItem) => JSON.stringify([r.path, r.method, r.status ?? 0, r.durationMs, r.dbCount, r.fetchMs, r.service, r.insights][["path", "method", "status", "duration", "sql", "fetch", "service", "insights"].indexOf(key)]);
      expect((got.items as RequestItem[]).map(value)).toEqual(want.slice((last - 1) * 10).map(value));
    }
  });

  it("matches text and status filters and aggregates the matches", () => {
    const want = applyFilter(rows, { ...none, status: "failed", q: "PAY" });
    const got = list({ table: "requests", filter: { status: "failed", q: "PAY" }, sort: { key: "time", desc: true }, limit: 3, count: true, aggregate: { buckets: 24 } });
    expect(got.total).toBe(want.length);
    expect(got.items).toHaveLength(3);
    expect(got.aggregate!.total).toMatchObject({ n: want.length, err: want.filter(isFailed).length, hist: null, firstMs: 0 });
    expect(got.aggregate!.series.map((a) => a.n)).toEqual(series(want, (r) => r.startMs, ctx.window, 24));
    const one = list({ table: "requests", filter: { traceId: rows[3]!.traceId }, sort: { key: "time", desc: true }, limit: 1 });
    expect([(one.items[0] as RequestItem).traceId, one.total]).toEqual([rows[3]!.traceId, null]);
  });
});

describe("memory executor: trace, log, and critical lists", () => {
  it("lists traces newest first, with search over path, services, and id", () => {
    const got = list({ table: "traces", filter: { q: " Checkout " }, sort: { key: "time", desc: true }, limit: 10, count: true });
    const match = cur.filter((t) => traceListItem(t).path.toLowerCase().includes("checkout") || t.services.some((s) => s.includes("checkout")));
    expect(got.total).toBe(match.length);
    expect((got.items as TraceItem[]).map((t) => t.traceId)).toEqual(match.slice(0, 10).map((t) => t.traceId));
    const byId = list({ table: "traces", filter: { q: cur[4]!.traceId.slice(0, 7) }, sort: { key: "time", desc: true }, count: true });
    expect(byId.items.map((t) => (t as TraceItem).traceId)).toContain(cur[4]!.traceId);
  });

  it("filters logs by level, service, and text, newest first", () => {
    const filter = { minLevel: "warn", service: "api", query: "" } as const;
    const want = filterLogs(logRows(cur), filter);
    const got = list({ table: "logs", filter: { minLevel: "warn", logService: "api" }, sort: { key: "time", desc: true }, page: { page: 1, size: 30 } });
    expect(got.total).toBe(want.length);
    expect(got.items.map((r) => (r as { key: string }).key)).toEqual(want.slice(0, 30).map((r) => r.key));
    const q = list({ table: "logs", filter: { q: "payment" }, sort: { key: "time", desc: true }, count: true });
    expect(q.total).toBe(filterLogs(logRows(cur), { minLevel: "trace", service: "", query: "payment" }).length);
  });

  it("lists the slowest spans of the window", () => {
    const got = list({ table: "critical", filter: {}, sort: { key: "duration", desc: true }, limit: 25 });
    expect(got.items.map((s) => (s as { durationMs: number }).durationMs)).toEqual(criticalSpans(cur, 25).map((s) => s.durationMs));
  });
});
