import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ErrorGroup, Headline, InsightGroup, ServiceRow, TimeRange } from "@wizeworks/lens-core";
import { z } from "zod";
import { json, type McpDataSource, type McpProject, READ_ONLY, type Source } from "./mcp-shared.js";

const RANGES = ["1h", "6h", "24h", "7d"] as const satisfies readonly TimeRange[];
const TOP_ERRORS = 10;
const SEVERITY: Record<ServiceRow["status"], number> = { unhealthy: 0, degraded: 1, healthy: 2, idle: 3 };

const iso = (ms: number) => new Date(ms).toISOString();
const round = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const headline = (h: Headline) => ({ value: round(h.value), previous: round(h.previous), changePercent: round(h.change) });

const serviceOf = (r: ServiceRow) => ({ name: r.name, kind: r.kind, status: r.status, requests: r.requests, errors: r.errors, errorRatePercent: round(r.errorRate), avgMs: round(r.avgMs), p95Ms: round(r.p95Ms) });

const errorOf = (g: ErrorGroup) => ({
  type: g.type,
  message: g.message,
  service: g.service,
  endpoint: g.endpoint,
  count: g.count,
  critical: g.critical,
  firstSeen: iso(g.firstSeenMs),
  lastSeen: iso(g.lastSeenMs),
  traceId: g.traceIds[0] ?? null,
});

const insightOf = (i: InsightGroup) => ({ title: i.title, impact: i.impact, occurrences: i.occurrences, totalMs: round(i.totalMs), endpoints: i.endpoints.slice(0, 3) });

/** One project's morning report: traffic against the window before, every service's health, the top errors, and the biggest insights. */
async function reportOf(data: McpDataSource, range: TimeRange) {
  const [ov, svc, err] = await Promise.all([data.page!("overview", range), data.page!("services", range), data.page!("errors", range)]);
  const services = [...svc.rows].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || b.requests - a.requests);
  return {
    window: { from: iso(ov.meta.window.from), to: iso(ov.meta.window.to), comparedWith: ov.meta.compareLabel },
    stillSettling: ov.meta.settling ?? 0,
    requests: headline(ov.headlines.total),
    errorRatePercent: headline(ov.headlines.errorRate),
    avgDurationMs: headline(ov.headlines.avgDuration),
    needsAttention: services.filter((s) => s.status === "unhealthy" || s.status === "degraded").map((s) => `${s.name}: ${s.status}`),
    services: services.map(serviceOf),
    exceptions: err.exceptions,
    topErrors: [...err.groups].sort((a, b) => b.count - a.count).slice(0, TOP_ERRORS).map(errorOf),
    insights: ov.insights.map(insightOf),
  };
}

type Report = Awaited<ReturnType<typeof reportOf>>;

/** Every project at once, the ones that need attention first, with totals across them. */
function summaryOf(range: TimeRange, reports: { project: McpProject; report: Report }[]) {
  const sorted = [...reports].sort((a, b) => b.report.needsAttention.length - a.report.needsAttention.length || (b.report.requests.value ?? 0) - (a.report.requests.value ?? 0));
  const services = reports.flatMap((r) => r.report.services);
  return {
    range,
    totals: {
      projects: reports.length,
      requests: reports.reduce((t, r) => t + (r.report.requests.value ?? 0), 0),
      exceptions: reports.reduce((t, r) => t + r.report.exceptions, 0),
      services: services.length,
      unhealthy: services.filter((s) => s.status === "unhealthy").length,
      degraded: services.filter((s) => s.status === "degraded").length,
    },
    projects: sorted.map(({ project, report }) => ({ project: project.name, projectId: project.id, ...report })),
  };
}

/** get_overview: the dashboard's overview for a morning report. On a host with several projects, no `project` reads them all. */
export function registerOverviewTool(server: McpServer, src: Source): void {
  if (!src.defaults.overview) return;
  const inputSchema = { ...src.arg, range: z.enum(RANGES).optional().describe("Time range, compared with the one before it. Default 24h.") };
  const description =
    "A health report: requests, error rate, and duration against the window before; every service's status, traffic, errors, and p95; the top errors; and the biggest performance insights. Without `project` on a multi-project host, it covers every project. Good for a daily or morning report.";
  server.registerTool("get_overview", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const range = args.range ?? "24h";
    const named = (args as { project?: string }).project;
    if (named || !src.each) return json({ range, ...(await reportOf(await src.open("get_overview", args), range)) });
    const all = await src.each("get_overview", args);
    return json(summaryOf(range, await Promise.all(all.map(async ({ project, data }) => ({ project, report: await reportOf(data, range) })))));
  });
}
