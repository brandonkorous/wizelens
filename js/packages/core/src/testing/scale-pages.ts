// Whole-page parity for SQL executors: every page and range against the memory executor. Test-only: excluded from the build.
import { PAGES, type PageName, runPage, runPageSync } from "../models/index.js";
import { memoryExecutor } from "../scale/memory.js";
import { issueId, type IssueState, type IssueStates } from "../issues.js";
import { type Executor, type PageContext, type SyncExecutor, windowOfRef } from "../scale/needs.js";
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
  requests: [{ endpoint: "POST /api/pay" }, { user: "nope" }, { insights: "1" }, { sort: "errors" }, { sort: "db", desc: "0" }, { service: "Web App" }, { method: "POST" }, { status: "5xx" }, { status: "failed", duration: "medium" }, { duration: "slowest" }, { service: "orders" }, { q: "orders" }, { q: "orders", status: "failed" }, { sort: "duration", desc: "0", page: "2", size: "5" }, { status: "bogus" }],
  traces: [{ q: "checkout" }, { q: "nothing-matches" }, { trace: "f".repeat(32) }, { service: "orders" }, { service: "Web App" }, { status: "error" }, { status: "ok" }, { duration: "slowest" }, { sort: "duration" }, { page: "2", size: "5" }, { service: "api", status: "error", sort: "duration" }],
  logs: [{ level: "warn" }, { level: "error", service: "api" }, { q: "order" }, { page: "2", size: "5" }, { service: "orders" }, { level: "warn", exact: "1" }, { category: "api.app" }, { trace: "f".repeat(32) }, { user: "user-0" }, { user: "user-0", level: "warn" }],
  insights: [{ area: "database" }, { impact: "high" }, { q: "orders" }, { service: "api" }, { service: "Web App" }, { endpoint: "GET /api/orders/{id}" }, { service: "api", release: "1.0.0" }, { service: "api", release: "1.1.0" }],
  rendering: [{ q: "checkout" }, { q: "nothing" }],
  errors: [{ q: "pay" }, { q: "TIMEOUT" }, { service: "api" }, { service: "Web App" }, { type: "TimeoutError" }, { critical: "1" }, { sort: "count" }, { page: "2", size: "2" }, { endpoint: "POST /api/pay" }, { endpoint: "nope" }, { service: "api", critical: "1", sort: "count" }, { service: "api", release: "1.0.0" }, { service: "api", release: "1.2.0", new: "1" }, { service: "api", release: "9.9" }, { user: "user-9" }, { user: "user-9", endpoint: "POST /api/pay" }],
  database: [{ service: "api" }, { service: "orders" }, { q: "orders" }, { q: "SELECT" }, { table: "items" }, { operation: "select" }, { operation: "INSERT" }, { database: "postgresql" }, { sort: "count" }, { sort: "total", page: "2", size: "5" }, { page: "99" }],
  overview: [{ from: String(SCENARIO_NOW - 3 * 3_600_000), to: String(SCENARIO_NOW - 3_600_000) }, { compare: "week" }, { service: "orders" }, { service: "api" }, { service: "Web App" }, { service: "nope" }],
  service: [{ service: "orders" }, { service: "Web App" }, { service: "nope" }],
  users: [{}, { q: "user-1" }, { page: "2", size: "2" }],
  user: [{ user: "user-9" }, { user: "user-0" }, { user: "nobody" }],
};

/** Params per page: the fixed ones, plus selections picked from the memory models (a trace, a service row, an insight). */
function paramsOf(page: PageName, range: TimeRange, mem: SyncExecutor): Record<string, string>[] {
  const ctx = pageContext(range, SCENARIO_NOW, {});
  const extra: Record<string, string>[] = [];
  if (page === "traces") extra.push(...runPageSync("traces", ctx, mem).recent.slice(0, 2).map((t) => ({ trace: t.traceId })));
  if (page === "services" || page === "service") extra.push(...runPageSync("services", ctx, mem).rows.map((r) => ({ service: r.key })));
  if (page === "error") extra.push(...runPageSync("errors", ctx, mem).groups.slice(0, 3).map((g) => ({ group: g.key })), { group: "nope" });
  if (page === "endpoint") extra.push(...runPageSync("service", pageContext(range, SCENARIO_NOW, { service: "api:orders" }), mem).endpoints.slice(0, 3).map((e) => ({ service: "api:orders", endpoint: e.name })), { service: "api", endpoint: "nope" });
  if (page === "query") extra.push(...runPageSync("database", pageContext(range, SCENARIO_NOW, { size: "200" }), mem).queries.slice(0, 3).map((q) => ({ q: q.query })), { q: "nope" });
  if (page === "route") extra.push(...runPageSync("rendering", ctx, mem).routes.slice(0, 2).map((r) => ({ route: r.route })), { route: "nope" });
  if (page === "errors") extra.push(...runPageSync("errors", ctx, mem).groups.slice(0, 2).map((g) => ({ group: g.key })), { group: "nope" }, { _issues: "1" }, { _issues: "1", status: "resolved" }, { _issues: "1", status: "ignored" }, { new: "1" });
  if (page === "insights" || page === "overview") extra.push({ _issues: "1" });
  if (page === "insights") extra.push(...runPageSync("insights", ctx, mem).groups.slice(0, 2).map((g) => ({ key: g.key })));
  return [{}, ...(STATIC[page] ?? []), ...extra];
}

/** A trace as compared: stored traces are rebuilt from spans and logs, so compare their identity and size. */
function slim(model: unknown): unknown {
  const m = model as { selected?: unknown };
  const t = m && typeof m === "object" && m.selected && typeof m.selected === "object" && "spans" in m.selected ? (m.selected as Trace) : null;
  return t ? { ...m, selected: { traceId: t.traceId, spanCount: t.spanCount, logs: t.logs.length } } : model;
}

/** Error group trace ids (listed and selected) come from the newest few buckets in SQL: check they are newest memory ids, then align them. */
function alignIds(sql: unknown, want: unknown, out: string[]): void {
  type Group = { traceIds?: string[] };
  const one = (m: unknown) => (m as { selected?: unknown }).selected as Group | null | undefined;
  const groups = (m: unknown): Group[] => [...(((m as { groups?: unknown }).groups ?? []) as Group[]), ...(one(m)?.traceIds ? [one(m)!] : [])];
  groups(sql).forEach((g, i) => {
    const w = groups(want)[i]?.traceIds;
    if (!g.traceIds || !w) return;
    if (!g.traceIds.every((id) => w.includes(id)) || g.traceIds.length === 0 || g.traceIds[0] !== w[0]) out.push(`groups[${i}].traceIds: ${g.traceIds.join(",")} not newest of ${w.join(",")}`);
    g.traceIds = w;
  });
}

/** Lists built from a row's trace ids (newest few buckets in SQL): check they are newest memory items, then align them. */
const ID_LISTS: Partial<Record<PageName, string[]>> = { error: ["requests", "traces"], endpoint: ["recent"], query: ["traces"], route: ["loads"] };

function alignIdLists(page: PageName, sql: unknown, want: unknown, out: string[]): void {
  type Item = { traceId: string };
  for (const field of ID_LISTS[page] ?? []) {
    const a = (sql as Record<string, Item[]>)[field] ?? [];
    const b = (want as Record<string, Item[]>)[field] ?? [];
    if (a.some((x) => !b.some((y) => y.traceId === x.traceId)) || a.length === 0 !== (b.length === 0)) out.push(`${field}: ${a.map((x) => x.traceId).join(",")} not within ${b.map((x) => x.traceId).join(",")}`);
    (sql as Record<string, Item[]>)[field] = b;
  }
  const g = (m: unknown) => (m as { group?: { traceIds?: string[] } | null }).group;
  if (g(sql)?.traceIds && g(want)?.traceIds) g(sql)!.traceIds = g(want)!.traceIds;
}

/** Issue states for `_issues=1` cases: the two newest error groups resolved (the first one before it last happened) and ignored. */
function demoIssues(ctx: PageContext, mem: SyncExecutor): IssueStates {
  const [a, b] = runPageSync("errors", { ...ctx, params: {} }, mem).groups;
  const state = (key: string, status: IssueState["status"], resolvedMs: number | null): IssueState => ({ kind: "error", key, status, untilMs: null, resolvedMs, assignee: null, updatedMs: 0 });
  return Object.fromEntries([...(a ? [state(a.key, "resolved", a.lastSeenMs - 1)] : []), ...(b ? [state(b.key, "ignored", null)] : [])].map((s) => [issueId(s.kind, s.key), s]));
}

/** Differences between SQL and memory pages for every page, range, and param set. */
export async function pageParity(ex: Executor, traces: readonly Trace[], ranges: readonly TimeRange[], retentionMs: number): Promise<string[]> {
  const mem = tierMemory(traces, retentionMs);
  const out: string[] = [];
  for (const page of Object.keys(PAGES) as PageName[]) {
    for (const range of ranges) {
      for (const params of paramsOf(page, range, mem)) {
        const base = pageContext(range, SCENARIO_NOW, params);
        const ctx = params._issues ? { ...base, issues: demoIssues(base, mem) } : base;
        const sql = slim(await runPage(page, ctx, ex));
        const want = slim(runPageSync(page, ctx, mem));
        const ids: string[] = [];
        alignIds(sql, want, ids);
        alignIdLists(page, sql, want, ids);
        out.push(...[...ids, ...differences(sql, want)].map((d) => `${page} ${range} ${JSON.stringify(params)} ${d}`));
      }
    }
  }
  return out;
}
