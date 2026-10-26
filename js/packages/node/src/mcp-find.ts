import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findNPlusOneDb, findNPlusOneHttp, parseSearch, queryText, type TimeRange, type Trace } from "@wizeworks/lens-core";
import { z } from "zod";
import { json, type McpDataSource, READ_ONLY, type Source } from "./mcp-shared.js";
import { findAll, rangeArg } from "./mcp-store.js";

/** How many slow queries are read, newest first, before the slowest are picked. */
const SLOW_SCAN = 5_000;

/** The slowest database spans over `threshold` in the range, with their SQL. Only the picked spans load their trace. */
async function slowQueries(data: McpDataSource, threshold: number, range: TimeRange, limit: number) {
  const spans = await findAll(data, "spans", parseSearch(`category:db duration:>=${threshold}ms`), range, SLOW_SCAN);
  const top = spans.sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
  const traces = new Map<string, Promise<Trace | undefined>>();
  const rows = [];
  for (const s of top) {
    const trace = await (traces.get(s.traceId) ?? traces.set(s.traceId, Promise.resolve(data.get(s.traceId, false))).get(s.traceId)!);
    const span = trace?.spans.find((x) => x.spanId === s.spanId);
    rows.push({ traceId: s.traceId, spanId: s.spanId, durationMs: s.durationMs, query: span ? queryText(span) : s.name, service: s.service });
  }
  return rows;
}

/** Requests read to find N+1 candidates with another repeat count, and traces of them loaded. */
const N1_SCAN = 5_000;
const N1_LOAD = 200;

interface N1Group {
  kind: "db" | "http";
  shape: string;
  endpoints: string[];
  /** Requests that had it. */
  requests: number;
  /** Repeats over all of them. */
  repeats: number;
  totalMs: number;
  lastSeen: string;
  exampleTraceId: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Insight groups read from the stats: one page this long holds them all. */
const N1_STATS = 5000;

/** From the stats: the N+1 insights of the whole range, at the host's threshold. */
async function fromStats(data: McpDataSource, range: TimeRange): Promise<N1Group[]> {
  const m = await data.page!("insights", range, { status: "all", size: String(N1_STATS) });
  return m.groups
    .filter((g) => g.kind === "n+1-db" || g.kind === "n+1-http")
    .map((g) => ({ kind: g.kind === "n+1-db" ? "db" : "http", shape: g.shape, endpoints: g.endpoints.slice(0, 5), requests: g.occurrences, repeats: g.count, totalMs: Math.round(g.totalMs), lastSeen: iso(g.lastSeenMs), exampleTraceId: g.exampleTraceId }));
}

/** With another threshold: the requests with that many database or HTTP calls, most first, read whole and grouped by shape. */
async function fromTraces(data: McpDataSource, n: number, range: TimeRange): Promise<N1Group[]> {
  const requests = await findAll(data, "requests", null, range, N1_SCAN);
  const busy = requests.filter((r) => r.dbCount >= n || r.fetchCount >= n).sort((a, b) => Math.max(b.dbCount, b.fetchCount) - Math.max(a.dbCount, a.fetchCount)).slice(0, N1_LOAD);
  const groups = new Map<string, N1Group>();
  for (const r of busy) {
    const t = await data.get(r.traceId, false);
    if (!t) continue;
    const found = [...findNPlusOneDb(t, n).map((f) => ({ kind: "db" as const, f })), ...findNPlusOneHttp(t, n).map((f) => ({ kind: "http" as const, f }))];
    for (const { kind, f } of found) {
      const g = groups.get(`${kind}|${f.shape}`) ?? { kind, shape: f.shape, endpoints: [], requests: 0, repeats: 0, totalMs: 0, lastSeen: iso(t.startMs), exampleTraceId: t.traceId };
      if (!g.endpoints.includes(r.endpoint) && g.endpoints.length < 5) g.endpoints.push(r.endpoint);
      groups.set(`${kind}|${f.shape}`, { ...g, requests: g.requests + 1, repeats: g.repeats + f.count, totalMs: Math.round(g.totalMs + f.totalMs) });
    }
  }
  return [...groups.values()];
}

function registerSlowQueries(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    thresholdMs: z.number().min(0).optional().describe(`Default ${src.defaults.slowQueryMs}.`),
    limit: z.number().int().min(1).max(500).optional().describe("Default 20."),
    range: rangeArg("to look"),
  };
  const description = "Find the slowest database queries over a threshold, from the whole store.";
  server.registerTool("find_slow_queries", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("find_slow_queries", args);
    return json(await slowQueries(data, args.thresholdMs ?? data.slowQueryMs, args.range ?? "24h", args.limit ?? 20));
  });
}

function registerNPlusOne(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    minRepeats: z.number().int().min(2).optional().describe(`Default ${src.defaults.nPlusOneThreshold}, the project's threshold.`),
    limit: z.number().int().min(1).max(200).optional().describe("Default 20."),
    range: rangeArg("to look"),
  };
  const description = "Find N+1 patterns (the same SQL or HTTP call shape repeated in one request), grouped by shape, the most time first, from the whole store.";
  server.registerTool("find_n_plus_one", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const data = await src.open("find_n_plus_one", args);
    const n = args.minRepeats ?? data.nPlusOneThreshold;
    const range = args.range ?? "24h";
    const groups = data.page && n === data.nPlusOneThreshold ? await fromStats(data, range) : await fromTraces(data, n, range);
    return json(groups.sort((a, b) => b.totalMs - a.totalMs).slice(0, args.limit ?? 20));
  });
}

/** find_slow_queries and find_n_plus_one. */
export function registerFindTools(server: McpServer, src: Source): void {
  registerSlowQueries(server, src);
  registerNPlusOne(server, src);
}
