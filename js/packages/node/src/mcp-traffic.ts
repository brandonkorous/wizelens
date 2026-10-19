import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TimeRange, TrafficEndpoint, TrafficModel, TrafficStats } from "@wizeworks/lens-core";
import { z } from "zod";
import { json, type McpDataSource, type McpProject, READ_ONLY, type Source } from "./mcp-shared.js";

const RANGES = ["1h", "6h", "24h", "7d", "30d"] as const satisfies readonly TimeRange[];
const SORTS = { requests: (e: TrafficStats) => e.requests, errors: (e: TrafficStats) => e.errors, errorRate: (e: TrafficStats) => e.errorRatePercent, p95: (e: TrafficStats) => e.p95Ms ?? -1, avg: (e: TrafficStats) => e.avgMs ?? -1 };
type Sort = keyof typeof SORTS;
const MAX_ENDPOINTS = 200;

const iso = (ms: number) => new Date(ms).toISOString();
const round = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const statsOut = (s: TrafficStats) => ({ requests: s.requests, errors: s.errors, errorRatePercent: round(s.errorRatePercent), avgMs: round(s.avgMs), p95Ms: round(s.p95Ms) });

const windowArgs = {
  range: z.enum(RANGES).optional().describe("Time range ending now. Default 24h. Ignored when `from` and `to` are given."),
  from: z.string().optional().describe("Start of a custom window, ISO 8601 (for example 2026-10-19T00:00:00Z). Use with `to`."),
  to: z.string().optional().describe("End of a custom window, ISO 8601. Use with `from`."),
  service: z.string().optional().describe("Only this service (its name, as get_overview lists it)."),
};

type WindowArgs = { range?: TimeRange; from?: string; to?: string; service?: string };

/** Page params from the tool's window and filter arguments. A bad time is an error the agent can read. */
function paramsOf(args: WindowArgs, more: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = { ...more, ...(args.service ? { service: args.service } : {}) };
  if (!args.from && !args.to) return out;
  const from = Date.parse(args.from ?? "");
  const to = Date.parse(args.to ?? "");
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error("Give `from` and `to` as ISO 8601 times, with `to` after `from`.");
  return { ...out, from: String(from), to: String(to) };
}

const windowOut = (m: TrafficModel) => ({ from: iso(m.meta.window.from), to: iso(m.meta.window.to), stillSettling: m.meta.settling ?? 0 });

function seriesOut(m: TrafficModel) {
  const scope = m.scope.found ? m.scope : { ...m.scope, note: `${m.scope.service} had no traffic in this window. get_overview lists the services.` };
  const points = m.points.map((p) => ({ start: iso(p.start), ...statsOut(p) }));
  return { window: windowOut(m), scope, bucketMinutes: round(m.bucketMs / 60_000), totals: statsOut(m.totals), points };
}

/** Endpoints sorted and cut, and the totals before the cut. */
function endpointsOut(list: readonly (TrafficEndpoint & { project?: string })[], sort: Sort, limit: number, minRequests: number) {
  const kept = list.filter((e) => e.requests >= minRequests);
  const by = SORTS[sort];
  const sorted = [...kept].sort((a, b) => by(b) - by(a) || b.requests - a.requests);
  const rows = sorted.slice(0, limit).map((e) => ({ ...(e.project ? { project: e.project } : {}), service: e.service, endpoint: e.endpoint, ...statsOut(e) }));
  return { endpoints: kept.length, requests: kept.reduce((t, e) => t + e.requests, 0), shown: rows.length, rows };
}

/** One project's model, or each project's on a multi-project host when no `project` is named. */
async function modelsOf(src: Source, tool: string, args: WindowArgs, params: Record<string, string>): Promise<{ project: McpProject | null; model: TrafficModel }[]> {
  const read = (data: McpDataSource) => data.page!("traffic", args.range ?? "24h", params);
  if ((args as { project?: string }).project || !src.each) return [{ project: null, model: await read(await src.open(tool, args)) }];
  const all = await src.each(tool, args);
  return Promise.all(all.map(async ({ project, data }) => ({ project, model: await read(data) })));
}

function registerTimeseries(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    ...windowArgs,
    endpoint: z.string().optional().describe('Only this endpoint, as group_requests lists it (for example "GET /orders/{id}"). With or without `service`.'),
    buckets: z.enum(["16", "24", "48"]).optional().describe("Buckets in the window. Default 24 (hourly over 24h)."),
  };
  const description =
    "Exact request counts over time: requests, errors, error rate, average, and p95 duration per bucket, from WizeLens's own counts (not a sample). For every request, one service, or one endpoint, over a range or a custom from–to window. Good for traffic and error charts.";
  server.registerTool("get_timeseries", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const params = paramsOf(args, { buckets: args.buckets ?? "24", ...(args.endpoint ? { endpoint: args.endpoint } : {}) });
    const models = await modelsOf(src, "get_timeseries", args, params);
    if (models.length === 1 && !models[0]!.project) return json(seriesOut(models[0]!.model));
    return json({ projects: models.map(({ project, model }) => ({ project: project?.name, projectId: project?.id, ...seriesOut(model) })) });
  });
}

function registerGroupRequests(server: McpServer, src: Source): void {
  const inputSchema = {
    ...src.arg,
    ...windowArgs,
    sort: z.enum(Object.keys(SORTS) as [Sort, ...Sort[]]).optional().describe("Order: requests (default), errors, errorRate, p95, or avg."),
    limit: z.number().int().min(1).max(MAX_ENDPOINTS).optional().describe("Endpoints to return. Default 50."),
    minRequests: z.number().int().min(0).optional().describe("Leave out endpoints with fewer requests, for example when sorting by p95."),
  };
  const description =
    "Requests grouped by endpoint: count, errors, error rate, average, and p95 duration of every endpoint of your APIs and web apps, from WizeLens's own counts (not a sample). Over a range or a custom from–to window; without `project` on a multi-project host, across every project.";
  server.registerTool("group_requests", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const models = await modelsOf(src, "group_requests", args, paramsOf(args));
    const list = models.flatMap(({ project, model }) => model.endpoints.map((e) => ({ ...e, ...(project ? { project: project.name } : {}) })));
    const window = models[0] ? windowOut(models[0].model) : null;
    return json({ window, ...endpointsOut(list, args.sort ?? "requests", args.limit ?? 50, args.minRequests ?? 0) });
  });
}

/** get_timeseries and group_requests: exact traffic from the host's stats, where the host serves page models. */
export function registerTrafficTools(server: McpServer, src: Source): void {
  if (!src.defaults.overview) return;
  registerTimeseries(server, src);
  registerGroupRequests(server, src);
}
