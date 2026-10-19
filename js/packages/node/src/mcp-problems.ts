import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Anomaly, causeText, type Problem, type ProblemsModel, type TimeRange } from "@wizeworks/lens-core";
import { z } from "zod";
import { json, type McpDataSource, type McpProject, READ_ONLY, type Source } from "./mcp-shared.js";

const RANGES = ["1h", "6h", "24h", "7d"] as const satisfies readonly TimeRange[];

const iso = (ms: number) => new Date(ms).toISOString();
const round = (v: number) => Math.round(v * 100) / 100;

const anomalyOf = (a: Anomaly) => ({
  metric: a.metric,
  service: a.name,
  endpoint: a.endpoint,
  started: iso(a.startMs),
  ongoing: a.ongoing,
  value: round(a.peak.value),
  normal: round(a.peak.normal),
  alertsAbove: round(a.peak.upper),
});

const problemOf = (p: Problem) => ({
  id: p.id,
  title: p.title,
  started: iso(p.startMs),
  ended: p.ongoing ? null : iso(p.endMs),
  ongoing: p.ongoing,
  services: p.services.map((s) => `${s.name} (${s.kind})`),
  suspectedCause: p.cause ? causeText(p.cause) : null,
  otherCauses: p.causes.slice(1).map(causeText),
  anomalies: p.anomalies.map(anomalyOf),
  moreAnomalies: p.anomalyCount - p.anomalies.length,
});

function reportOf(m: ProblemsModel) {
  const normal = m.baseline.mode === "week" ? "the same hour in earlier weeks" : "the same hour on earlier days";
  return {
    window: { from: iso(m.meta.window.from), to: iso(m.meta.window.to) },
    baseline: m.baseline.learning ? `learning: needs two earlier ${m.baseline.mode}s with data, has ${m.baseline.samples}` : `normal is ${normal} (${m.baseline.samples} with data)`,
    problems: m.total,
    ongoing: m.ongoing,
    list: m.problems.map(problemOf),
  };
}

const problemsOf = async (data: McpDataSource, range: TimeRange) => reportOf(await data.page!("problems", range));

/** list_problems: services and endpoints above their normal, grouped into problems with a suspected cause. */
export function registerProblemTools(server: McpServer, src: Source): void {
  if (!src.defaults.overview) return;
  const inputSchema = { ...src.arg, range: z.enum(RANGES).optional().describe("Time range to look for problems in. Default 24h.") };
  const description =
    "Problems: error rate, p95 duration, or traffic above normal (the same hour in earlier weeks, plain statistics) on services and endpoints that call each other, grouped by when they started. Each names a suspected cause: a new release, a new error group, a query, or a service further down the calls. Ongoing problems come first. Without `project` on a multi-project host, it covers every project.";
  server.registerTool("list_problems", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    const range = args.range ?? "24h";
    const named = (args as { project?: string }).project;
    if (named || !src.each) return json({ range, ...(await problemsOf(await src.open("list_problems", args), range)) });
    const all = await src.each("list_problems", args);
    const projects = await Promise.all(all.map(async ({ project, data }: { project: McpProject; data: McpDataSource }) => ({ project: project.name, projectId: project.id, ...(await problemsOf(data, range)) })));
    return json({ range, projects: projects.sort((a, b) => b.ongoing - a.ongoing || b.problems - a.problems) });
  });
}
