import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fmtMetric, type MetricDetail, type MetricsModel, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { z } from "zod";
import { type Audit, json, type McpDataSource, READ_ONLY } from "./mcp-shared.js";

const POINTS = 12;
const ALL_RANGES = Object.keys(TIME_RANGES) as TimeRange[];

/** Sixty buckets as twelve: the average of each run of buckets, with its start time. */
function shrink(d: MetricDetail, values: readonly (number | null)[]): [string, string][] {
  const size = Math.ceil(values.length / POINTS);
  const out: [string, string][] = [];
  for (let i = 0; i < values.length; i += size) {
    const vs = values.slice(i, i + size).filter((v): v is number => v != null);
    const v = vs.length ? vs.reduce((t, x) => t + x, 0) / vs.length : null;
    out.push([new Date(d.buckets[i]!).toISOString(), fmtMetric(v, d.displayUnit)]);
  }
  return out;
}

function catalogOf(m: MetricsModel) {
  return {
    services: m.services,
    runtime: m.runtime.map((r) => ({ service: r.service, stats: Object.fromEntries(r.stats.map((s) => [s.label, s.lastText])) })),
    metrics: m.catalog.map((c) => ({ name: c.name, kind: c.kind, unit: c.unit, area: c.area, services: c.services, series: c.series, last: c.lastText })),
  };
}

function detailOf(d: MetricDetail) {
  const fmt = (v: number | null) => fmtMetric(v, d.displayUnit);
  return {
    name: d.name,
    kind: d.kind,
    unit: d.displayUnit,
    description: d.description,
    shown: d.display === "percentiles" ? d.stat : d.display,
    groupBy: d.groupBy || null,
    groupKeys: d.groupKeys,
    summary: { last: fmt(d.summary.last), min: fmt(d.summary.min), max: fmt(d.summary.max), avg: fmt(d.summary.avg) },
    lines: d.lines.map((l) => ({ label: l.label, points: shrink(d, l.values) })),
    hiddenLines: d.hidden,
  };
}

function registerListMetrics(server: McpServer, data: McpDataSource, audit: Audit, ranges: [TimeRange, ...TimeRange[]]): void {
  const inputSchema = {
    range: z.enum(ranges).optional().describe(`Time range. Default ${ranges.includes("1h") ? "1h" : ranges[0]}.`),
    service: z.string().optional().describe("Only this service."),
    q: z.string().optional().describe("Only metrics whose name has this text."),
  };
  const description = "List metrics (CPU, memory, GC, request rates, app metrics) with their newest values, and a runtime summary per service.";
  server.registerTool("list_metrics", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    audit("list_metrics", args);
    const range = args.range ?? (ranges.includes("1h") ? "1h" : ranges[0]);
    return json(catalogOf(await data.metrics!(range, { service: args.service ?? "", q: args.q ?? "" })));
  });
}

function registerGetMetric(server: McpServer, data: McpDataSource, audit: Audit, ranges: [TimeRange, ...TimeRange[]]): void {
  const inputSchema = {
    name: z.string().min(1).describe("Metric name, for example process.cpu.utilization."),
    range: z.enum(ranges).optional().describe("Time range. Default 1h."),
    service: z.string().optional().describe("Only this service."),
    group: z.string().optional().describe('Split lines by this attribute key, or "service".'),
    stat: z.enum(["p50", "p95", "p99", "avg"]).optional().describe("Histograms: which value to show. Default p95."),
  };
  const description = "Get one metric over time: summary values and up to 12 points per line, formatted in its unit.";
  server.registerTool("get_metric", { description, inputSchema, annotations: READ_ONLY }, async (args) => {
    audit("get_metric", args);
    const range = args.range ?? (ranges.includes("1h") ? "1h" : ranges[0]);
    const params = { metric: args.name, service: args.service ?? "", group: args.group ?? "", stat: args.stat ?? "" };
    const m = await data.metrics!(range, params);
    return m.selected ? json(detailOf(m.selected)) : { ...json({ error: "metric not found in this range" }), isError: true };
  });
}

/** list_metrics and get_metric, when the data source has metrics. */
export function registerMetricTools(server: McpServer, data: McpDataSource, audit: Audit): void {
  if (!data.metrics) return;
  const ranges = (data.metricRanges?.length ? data.metricRanges : ALL_RANGES) as [TimeRange, ...TimeRange[]];
  registerListMetrics(server, data, audit, ranges);
  registerGetMetric(server, data, audit, ranges);
}
