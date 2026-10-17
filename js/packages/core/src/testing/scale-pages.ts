// Whole-page parity for SQL executors: every page and range against the memory executor. Test-only: excluded from the build.
import { PAGES, type PageName, runPage, runPageSync } from "../models/index.js";
import { memoryExecutor } from "../scale/memory.js";
import { type Executor, type SyncExecutor, windowOfRef } from "../scale/needs.js";
import { pageContext } from "../scale/run.js";
import type { TimeRange } from "../stats/common.js";
import type { Trace } from "../types.js";
import { differences } from "./parity.js";
import { seriesExact, tierSeries } from "./scale-compare.js";
import { SCENARIO_NOW } from "./scenario.js";

/** The memory executor with series placed by tier bucket where page buckets are not whole tier buckets, as SQL documents. */
export function tierMemory(traces: readonly Trace[], retentionMs: number): SyncExecutor {
  const mem = memoryExecutor(traces);
  return {
    runSync(needs, ctx) {
      const out = mem.runSync(needs, ctx);
      for (const n of needs) {
        if (n.type !== "series") continue;
        const w = windowOfRef(ctx, n.window);
        if (!seriesExact(w, n.buckets, ctx.now, retentionMs)) out.series[n.id] = tierSeries(mem.facts(), n, w, ctx.now, retentionMs);
      }
      return out;
    },
  };
}

const STATIC: Partial<Record<PageName, Record<string, string>[]>> = {
  requests: [{ method: "POST" }, { status: "5xx" }, { status: "failed", duration: "medium" }, { duration: "slowest" }, { service: "orders" }, { q: "orders" }, { q: "orders", status: "failed" }, { sort: "duration", desc: "0", page: "2", size: "5" }, { status: "bogus" }],
  traces: [{ q: "checkout" }, { q: "nothing-matches" }, { trace: "f".repeat(32) }],
  logs: [{ level: "warn" }, { level: "error", service: "api" }, { q: "order" }, { page: "2", size: "5" }],
  insights: [{ area: "database" }, { impact: "high" }, { q: "orders" }],
  rendering: [{ all: "routes" }],
  errors: [{ q: "pay" }],
};

/** Params per page: the fixed ones, plus selections picked from the memory models (a trace, a service row, an insight). */
function paramsOf(page: PageName, range: TimeRange, mem: SyncExecutor): Record<string, string>[] {
  const ctx = pageContext(range, SCENARIO_NOW, {});
  const extra: Record<string, string>[] = [];
  if (page === "traces") extra.push(...runPageSync("traces", ctx, mem).recent.slice(0, 2).map((t) => ({ trace: t.traceId })));
  if (page === "services") extra.push(...runPageSync("services", ctx, mem).rows.map((r) => ({ service: r.key })));
  if (page === "insights") extra.push(...runPageSync("insights", ctx, mem).groups.slice(0, 2).map((g) => ({ key: g.key })));
  return [{}, ...(STATIC[page] ?? []), ...extra];
}

/** A trace as compared: stored traces are rebuilt from spans and logs, so compare their identity and size. */
function slim(model: unknown): unknown {
  const m = model as { selected?: unknown };
  const t = m && typeof m === "object" && m.selected && typeof m.selected === "object" && "spans" in m.selected ? (m.selected as Trace) : null;
  return t ? { ...m, selected: { traceId: t.traceId, spanCount: t.spanCount, logs: t.logs.length } } : model;
}

/** Error group trace ids come from the newest few buckets in SQL: check they are newest memory ids, then align them. */
function alignIds(sql: unknown, want: unknown, out: string[]): void {
  const groups = (m: unknown) => ((m as { groups?: unknown }).groups ?? []) as { traceIds?: string[] }[];
  groups(sql).forEach((g, i) => {
    const w = groups(want)[i]?.traceIds;
    if (!g.traceIds || !w) return;
    if (!g.traceIds.every((id) => w.includes(id)) || g.traceIds.length === 0 || g.traceIds[0] !== w[0]) out.push(`groups[${i}].traceIds: ${g.traceIds.join(",")} not newest of ${w.join(",")}`);
    g.traceIds = w;
  });
}

/** Differences between SQL and memory pages for every page, range, and param set. */
export async function pageParity(ex: Executor, traces: readonly Trace[], ranges: readonly TimeRange[], retentionMs: number): Promise<string[]> {
  const mem = tierMemory(traces, retentionMs);
  const out: string[] = [];
  for (const page of Object.keys(PAGES) as PageName[]) {
    for (const range of ranges) {
      for (const params of paramsOf(page, range, mem)) {
        const ctx = pageContext(range, SCENARIO_NOW, params);
        const sql = slim(await runPage(page, ctx, ex));
        const want = slim(runPageSync(page, ctx, mem));
        const ids: string[] = [];
        alignIds(sql, want, ids);
        out.push(...[...ids, ...differences(sql, want)].map((d) => `${page} ${range} ${JSON.stringify(params)} ${d}`));
      }
    }
  }
  return out;
}
